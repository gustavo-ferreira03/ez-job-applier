import json

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.templating import Jinja2Templates

from db import get_job, init_db, job_summary
from events import EventBus
from runner import RunManager
from waiters import WaiterRegistry


app = FastAPI()
templates = Jinja2Templates(directory="templates")
events = EventBus()
waiters = WaiterRegistry(events)
runner = RunManager(events, waiters)


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/events")
async def stream_events():
    async def generator():
        yield f"data: {json.dumps({'type': 'connected'}, ensure_ascii=False)}\n\n"
        async for event in events.subscribe():
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(generator(), media_type="text/event-stream")


@app.get("/state")
async def state():
    init_db()
    return {"run": runner.state(), "waiters": waiters.state(), "jobs": job_summary(), "events": list(events.history)}


@app.post("/runs")
async def start_run(request: Request):
    payload = await request.json()
    try:
        if payload.get("loop_enabled"):
            await runner.start_loop(payload)
        else:
            await runner.start(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True}


@app.post("/runs/cancel")
async def cancel_run():
    return {"cancelled": await runner.cancel()}


@app.get("/jobs/{job_id}")
async def job_detail(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.post("/loop/pause")
async def pause_loop():
    return {"paused": await runner.pause_loop()}


@app.post("/loop/resume")
async def resume_loop():
    return {"resumed": await runner.resume_loop()}


@app.post("/loop/stop")
async def stop_loop():
    return {"stopped": await runner.stop_loop()}


@app.post("/answers")
async def answer(request: Request):
    payload = await request.json()
    request_id = payload.get("request_id")
    answers = payload.get("answers")
    if answers is None and payload.get("answer") is not None:
        waiter = waiters.pending_inputs.get(request_id)
        if waiter and len(waiter["event"].get("questions", [])) == 1:
            question_key = waiter["event"]["questions"][0]["question_key"]
            answers = {question_key: payload["answer"]}
    if not request_id or not isinstance(answers, dict):
        raise HTTPException(status_code=400, detail="request_id and answers are required")
    waiter = waiters.pending_inputs.get(request_id)
    if not waiter:
        raise HTTPException(status_code=404, detail="No pending input request")
    for question in waiter["event"].get("questions", []):
        answer_value = answers.get(question["question_key"])
        options = question.get("options") or []
        if answer_value is None:
            raise HTTPException(status_code=400, detail=f"Missing answer for {question['question']}")
        if options and answer_value not in options:
            raise HTTPException(status_code=400, detail=f"Answer is not valid for {question['question']}")
    waiters.resolve_answer(request_id, answers)
    await events.publish({"type": "answer_saved", "request_id": request_id})
    return {"ok": True}


@app.post("/answers/{request_id}/skip")
async def skip_answer(request_id: str):
    waiter = waiters.pending_inputs.get(request_id)
    if not waiter:
        raise HTTPException(status_code=404, detail="No pending input request")
    waiters.resolve_answer(request_id, None)
    await events.publish({"type": "input_skipped", "request_id": request_id})
    return {"ok": True}


@app.post("/applications/{job_id}/approve")
async def approve_submit(job_id: str, request: Request):
    return await submit_decision(job_id, request, "approve")


@app.post("/applications/{job_id}/skip")
async def skip_submit(job_id: str, request: Request):
    return await submit_decision(job_id, request, "skip")


@app.post("/applications/{job_id}/edit")
async def edit_submit(job_id: str, request: Request):
    payload = await request.json()
    request_id = payload.get("request_id")
    answers = payload.get("answers") or {}
    waiter = waiters.pending_submits.get(request_id)
    if not waiter or waiter["event"].get("job_id") != job_id:
        raise HTTPException(status_code=404, detail="No pending submit request")
    waiters.resolve_submit(request_id, {"decision": "edit", "answers": answers})
    await events.publish({"type": "submit_edit", "request_id": request_id, "job_id": job_id})
    return {"ok": True}


async def submit_decision(job_id, request, decision):
    payload = await request.json()
    request_id = payload.get("request_id")
    waiter = waiters.pending_submits.get(request_id)
    if not waiter or waiter["event"].get("job_id") != job_id:
        raise HTTPException(status_code=404, detail="No pending submit request")
    waiters.resolve_submit(request_id, decision)
    await events.publish({"type": f"submit_{decision}", "request_id": request_id, "job_id": job_id})
    return {"ok": True}


if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
