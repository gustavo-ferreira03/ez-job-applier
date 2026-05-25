import asyncio
import contextlib
from collections.abc import Callable, Sequence
from pathlib import Path

from appliers.base import BaseApplier
from db import Database
from events import EventBus
from models import Application, ApplicationStatus, Job
from sources.linkedin import LinkedInRateLimitedError


class ApplicationWorker:
    def __init__(
        self,
        db: Database,
        events: EventBus,
        applier_factories: list[Callable] | None = None,
        cv_dir: Path | None = None,
        idle_sleep=2,
    ):
        self.db = db
        self.events = events
        self.applier_factories = applier_factories or []
        self.cv_dir = cv_dir
        self.idle_sleep = idle_sleep
        self.task: asyncio.Task[None] | None = None
        self._stopping = False
        self._paused = False

    def pause(self):
        self._paused = True

    def resume(self):
        self._paused = False

    def start(self):
        if self.task is None or self.task.done():
            self._stopping = False
            self.task = asyncio.create_task(self.run())

    async def stop(self):
        self._stopping = True
        task = self.task
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    def is_running(self):
        return self.task is not None and not self.task.done()

    async def run(self):
        await self.events.publish({"type": "worker_started"})
        try:
            while not self._stopping:
                if self._paused:
                    await asyncio.sleep(self.idle_sleep)
                    continue
                application = self.db.next_task()
                if not application:
                    await asyncio.sleep(self.idle_sleep)
                    continue

                async with contextlib.AsyncExitStack() as stack:
                    appliers = [await stack.enter_async_context(f()) for f in self.applier_factories]
                    while application and not self._stopping:
                        await self.process_application(application, appliers)
                        application = self.db.next_task()
        except asyncio.CancelledError:
            await self.events.publish({"type": "worker_stopped"})
            raise
        except Exception as exc:
            await self.events.publish({"type": "worker_failed", "error": str(exc)})
            raise

    async def process_application(self, application: Application, appliers: Sequence[BaseApplier]):
        job = self.db.get_job_for_application(application)
        if not job:
            self.db.set_application_status(application.application_id, ApplicationStatus.FAILED, "Job not found")
            return

        applier = self.resolve_applier(job, appliers)
        if not applier:
            self.db.set_application_status(application.application_id, ApplicationStatus.FAILED, "No applier found")
            await self.publish_application_event("application_failed", application, job, "No applier found")
            return

        if self.cv_dir and application.cv_filename and hasattr(applier, "cv_path"):
            applier.cv_path = str(self.cv_dir / application.cv_filename)  # type: ignore[attr-defined]

        await self.events.publish({
            "type": "application_processing",
            "application_id": application.application_id,
            "job_id": application.job_id,
            "title": job.title,
            "company": job.company,
        })
        questions = self.db.list_questions(application.application_id)

        try:
            if application.status == ApplicationStatus.READY_FOR_REVIEW and application.submit_approved:
                result = await applier.submit(application, job, questions)
            else:
                result = await applier.analyze(application, job, questions)
        except LinkedInRateLimitedError as exc:
            self.db.set_application_status(application.application_id, ApplicationStatus.FAILED, str(exc))
            await self.publish_application_event("application_failed", application, job, str(exc))
            raise

        if result.questions:
            self.db.upsert_questions(application.application_id, result.questions)
        self.db.set_application_status(application.application_id, result.status, result.error_message)
        await self.publish_application_event(
            event_type_for_status(result.status),
            application,
            job,
            result.error_message,
        )

    def resolve_applier(self, job: Job, appliers: Sequence[BaseApplier]):
        matches = [applier for applier in appliers if applier.matches(job)]
        if not matches:
            return None
        return sorted(matches, key=lambda applier: applier.priority, reverse=True)[0]

    async def publish_application_event(self, event_type, application, job, error=None):
        event = {
            "type": event_type,
            "application_id": application.application_id,
            "job_id": application.job_id,
            "title": job.title,
            "company": job.company,
        }
        if error:
            event["error"] = error
        await self.events.publish(event)


def event_type_for_status(status: ApplicationStatus):
    return {
        ApplicationStatus.NEEDS_INPUT: "application_needs_input",
        ApplicationStatus.READY_FOR_REVIEW: "application_ready_for_review",
        ApplicationStatus.SUBMITTED: "application_submitted",
        ApplicationStatus.SKIPPED: "application_rejected",
        ApplicationStatus.REJECTED: "application_rejected",
        ApplicationStatus.FAILED: "application_failed",
        ApplicationStatus.FOUND: "application_found",
    }[status]
