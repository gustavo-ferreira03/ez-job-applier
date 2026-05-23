import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.templating import Jinja2Templates

from application_worker import ApplicationWorker
from appliers.linkedin_easy_apply import LinkedInEasyApplyApplier
from db import Database
from events import EventBus
from models import AnswerQuestionsRequest, RunConfig
from sources.linkedin import LinkedInRateLimitedError, LinkedInSession, LinkedInSource


class EZJobApplierServer:
    def __init__(self, db_path="jobs.db", config_path="settings.json"):
        self.config_path = Path(config_path)
        self.templates = Jinja2Templates(directory="templates")
        self.db = Database(db_path)
        self.events = EventBus()
        self.worker = ApplicationWorker(self.db, self.events)
        self.run_task: asyncio.Task[None] | None = None
        self.current_config = None

    @asynccontextmanager
    async def lifespan(self, _app: FastAPI):
        self.db.init()
        self.worker.start()
        try:
            yield
        finally:
            await self.worker.stop()

    def load_config(self):
        if self.config_path.exists():
            try:
                return json.loads(self.config_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        return {}

    def save_config(self, config):
        self.config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

    async def index(self, request: Request):
        return self.templates.TemplateResponse(request, "index.html")

    async def stream_events(self):
        async def generator():
            yield f"data: {json.dumps({'type': 'connected'}, ensure_ascii=False)}\n\n"
            async for event in self.events.subscribe():
                if event is None:
                    yield ":\n\n"
                else:
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    async def state(self):
        self.db.init()
        return {
            "run": {
                "running": self.is_run_active(),
                "worker_running": self.worker.is_running(),
                "current_config": self.current_config,
            },
            "jobs": self.db.job_summary(),
            "pending_questions": self.db.pending_question_applications(),
            "ready_for_review": self.db.ready_for_review_applications(),
            "events": list(self.events.history),
            "config": self.load_config(),
        }

    async def start_run(self, config: RunConfig):
        if self.is_run_active():
            raise HTTPException(status_code=409, detail="A run is already active")
        self.current_config = config.model_dump()
        self.save_config(self.current_config)
        self.run_task = asyncio.create_task(self.run_source(config))
        return {"ok": True}

    async def cancel_run(self):
        task = self.run_task
        if task is None or task.done():
            return {"cancelled": False}
        task.cancel()
        return {"cancelled": True}

    async def job_detail(self, job_id: str):
        job = self.db.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        application_id = job.get("application_id")
        job["questions"] = [q.model_dump() for q in self.db.list_questions(application_id)] if application_id else []
        return job

    async def answer_application(self, application_id: int, payload: AnswerQuestionsRequest):
        application = self.db.get_application(application_id)
        if not application:
            raise HTTPException(status_code=404, detail="Application not found")
        labels = {question.label for question in self.db.list_questions(application_id)}
        unknown = [label for label in payload.answers if label not in labels]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Unknown question label: {unknown[0]}")
        self.db.answer_questions(application_id, payload.answers)
        await self.events.publish({"type": "application_answers_saved", "application_id": application_id})
        return {"ok": True}

    async def approve_application(self, application_id: int):
        application = self.db.get_application(application_id)
        if not application:
            raise HTTPException(status_code=404, detail="Application not found")
        self.db.approve_application_submit(application_id)
        await self.events.publish({"type": "application_submit_approved", "application_id": application_id})
        return {"ok": True}

    async def skip_application(self, application_id: int):
        application = self.db.get_application(application_id)
        if not application:
            raise HTTPException(status_code=404, detail="Application not found")
        self.db.skip_application(application_id)
        await self.events.publish({"type": "application_skipped", "application_id": application_id})
        return {"ok": True}

    async def run_source(self, config: RunConfig):
        await self.events.publish({"type": "run_started", "config": config.model_dump()})
        count = 0
        self.worker.pause()
        try:
            async with LinkedInSession(headless=True) as session:
                async with LinkedInSource(session=session) as source:
                    async for job in source.discover_jobs(config):
                        self.db.save_jobs([job])
                        applications = self.db.ensure_applications_for_easy_apply_jobs([job])
                        count += 1
                        await self.events.publish(
                            {"type": "job_discovered", "job_id": job.job_id, "title": job.title, "company": job.company}
                        )
                        for application in applications:
                            await self.events.publish(
                                {
                                    "type": "application_created",
                                    "application_id": application.application_id,
                                    "job_id": application.job_id,
                                }
                            )
                        await self.events.publish({"type": "run_progress", "count": count, "job_id": job.job_id})

                async with LinkedInEasyApplyApplier(session=session) as applier:
                    while True:
                        task = self.db.next_task()
                        if not task:
                            break
                        try:
                            await self.worker.process_application(task, [applier])
                        except LinkedInRateLimitedError as exc:
                            await self.events.publish({"type": "run_failed", "error": str(exc)})
                            return

            await self.events.publish({"type": "run_finished", "count": count})
        except asyncio.CancelledError:
            await self.events.publish({"type": "run_cancelled"})
            raise
        except Exception as exc:
            await self.events.publish({"type": "run_failed", "error": str(exc)})
        finally:
            self.worker.resume()

    def is_run_active(self):
        return self.run_task is not None and not self.run_task.done()


server = EZJobApplierServer()
app = FastAPI(lifespan=server.lifespan)


@app.get("/")
async def index(request: Request):
    return await server.index(request)


@app.get("/events")
async def stream_events():
    return await server.stream_events()


@app.get("/state")
async def state():
    return await server.state()


@app.post("/runs")
async def start_run(config: RunConfig):
    return await server.start_run(config)


@app.post("/runs/cancel")
async def cancel_run():
    return await server.cancel_run()


@app.get("/jobs/{job_id}")
async def job_detail(job_id: str):
    return await server.job_detail(job_id)


@app.post("/applications/{application_id}/answers")
async def answer_application(application_id: int, payload: AnswerQuestionsRequest):
    return await server.answer_application(application_id, payload)


@app.post("/applications/{application_id}/approve")
async def approve_application(application_id: int):
    return await server.approve_application(application_id)


@app.post("/applications/{application_id}/skip")
async def skip_application(application_id: int):
    return await server.skip_application(application_id)


if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
