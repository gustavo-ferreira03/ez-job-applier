import asyncio
import json
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.templating import Jinja2Templates

from application_worker import ApplicationWorker
from appliers.linkedin_easy_apply import LinkedInEasyApplyApplier
from db import Database
from events import EventBus
from models import AnswerQuestionsRequest, ApplicationStatus, ApproveRequest, RunConfig, SetDefaultCVRequest
from sources.linkedin import LinkedInRateLimitedError, LinkedInSession, LinkedInSource

CONFIG_PATH = Path("settings.json")
CV_DIR = Path("cvs")
templates = Jinja2Templates(directory="templates")
db = Database("applier.db")
events = EventBus()
run_task: asyncio.Task[None] | None = None
current_config = None


def _cv_path() -> str | None:
    cv = load_config().get("default_cv")
    return str(CV_DIR / cv) if cv else None


def _make_linkedin_applier():
    return LinkedInEasyApplyApplier(headless=False, cv_path=_cv_path())


worker = ApplicationWorker(db, events, applier_factories=[_make_linkedin_applier], cv_dir=CV_DIR)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    CV_DIR.mkdir(exist_ok=True)
    db.init()
    worker.start()
    try:
        yield
    finally:
        await worker.stop()


app = FastAPI(lifespan=lifespan)


def load_config():
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_config(config):
    existing = load_config()
    existing.update(config)
    CONFIG_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")


def is_run_active():
    return run_task is not None and not run_task.done()


def list_cvs() -> list[str]:
    return sorted(p.name for p in CV_DIR.glob("*") if p.is_file())


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/events")
async def stream_events():
    async def generator():
        yield f"data: {json.dumps({'type': 'connected'}, ensure_ascii=False)}\n\n"
        async for event in events.subscribe():
            if event is None:
                yield ":\n\n"
            else:
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/state")
async def state():
    db.init()
    return {
        "run": {
            "running": is_run_active(),
            "worker_running": worker.is_running(),
            "current_config": current_config,
        },
        "jobs": db.job_summary(),
        "events": list(events.history),
        "config": load_config(),
        "cvs": list_cvs(),
    }


@app.post("/runs")
async def start_run(config: RunConfig):
    global run_task, current_config
    if is_run_active():
        raise HTTPException(status_code=409, detail="A run is already active")
    current_config = config.model_dump()
    save_config(current_config)
    run_task = asyncio.create_task(_run(config))
    return {"ok": True}


@app.post("/runs/cancel")
async def cancel_run():
    if run_task is None or run_task.done():
        return {"cancelled": False}
    run_task.cancel()
    return {"cancelled": True}


@app.get("/cvs")
async def get_cvs():
    return {"files": list_cvs()}


@app.post("/cvs")
async def upload_cv(file: UploadFile = File(...)):
    filename = Path(file.filename or "upload").name
    with (CV_DIR / filename).open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"filename": filename}


@app.post("/cvs/default")
async def set_default_cv(payload: SetDefaultCVRequest):
    cfg = load_config()
    cfg["default_cv"] = Path(payload.filename).name if payload.filename else None
    save_config(cfg)
    return {"ok": True}


@app.delete("/cvs/{filename}")
async def delete_cv(filename: str):
    safe = Path(filename).name
    (CV_DIR / safe).unlink(missing_ok=True)
    cfg = load_config()
    if cfg.get("default_cv") == safe:
        cfg.pop("default_cv", None)
        CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


@app.get("/jobs/{job_id}")
async def job_detail(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    application_id = job.get("application_id")
    job["questions"] = [q.model_dump() for q in db.list_questions(application_id)] if application_id else []
    return job


@app.post("/applications/{application_id}/answers")
async def answer_application(application_id: int, payload: AnswerQuestionsRequest):
    application = db.get_application(application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    labels = {question.label for question in db.list_questions(application_id)}
    unknown = [label for label in payload.answers if label not in labels]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown question label: {unknown[0]}")
    db.answer_questions(application_id, payload.answers)
    await events.publish({"type": "application_answers_saved", "application_id": application_id})
    return {"ok": True}


@app.post("/applications/{application_id}/approve")
async def approve_application(application_id: int, payload: ApproveRequest = ApproveRequest()):
    application = db.get_application(application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    db.approve_application_submit(application_id, payload.cv_filename)
    await events.publish({"type": "application_submit_approved", "application_id": application_id})
    return {"ok": True}


@app.post("/applications/{application_id}/mark-applied")
async def mark_applied(application_id: int):
    application = db.get_application(application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    db.set_application_status(application_id, ApplicationStatus.SUBMITTED)
    await events.publish({"type": "application_submitted", "application_id": application_id})
    return {"ok": True}


@app.post("/applications/{application_id}/skip")
async def skip_application(application_id: int):
    application = db.get_application(application_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    db.skip_application(application_id)
    await events.publish({"type": "application_rejected", "application_id": application_id})
    return {"ok": True}


async def _run(config: RunConfig):
    await events.publish({"type": "run_started", "config": config.model_dump()})
    count = 0
    worker.pause()
    try:
        async with LinkedInSession(headless=False) as session:
            await session.ensure_logged_in()
            async with LinkedInSource(session=session) as source, LinkedInEasyApplyApplier(session=session, cv_path=_cv_path()) as applier:
                async for job in source.discover_jobs(config):
                    db.save_jobs([job])
                    application = db.ensure_application_for_job(job.job_id)
                    count += 1
                    await events.publish(
                        {"type": "job_discovered", "job_id": job.job_id, "title": job.title, "company": job.company}
                    )
                    await events.publish(
                        {
                            "type": "application_created",
                            "application_id": application.application_id,
                            "job_id": application.job_id,
                        }
                    )
                    if applier.matches(job):
                        try:
                            await worker.process_application(application, [applier])
                        except LinkedInRateLimitedError as exc:
                            await events.publish({"type": "run_failed", "error": str(exc)})
                            return
                    else:
                        db.set_application_status(application.application_id, ApplicationStatus.EXTERNAL)
                    await events.publish({"type": "run_progress", "count": count, "job_id": job.job_id})
                    retry = db.next_task()
                    while retry:
                        try:
                            await worker.process_application(retry, [applier])
                        except LinkedInRateLimitedError as exc:
                            await events.publish({"type": "run_failed", "error": str(exc)})
                            return
                        retry = db.next_task()

        await events.publish({"type": "run_finished", "count": count})
    except asyncio.CancelledError:
        await events.publish({"type": "run_cancelled"})
        raise
    except Exception as exc:
        await events.publish({"type": "run_failed", "error": str(exc)})
    finally:
        worker.resume()


if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
