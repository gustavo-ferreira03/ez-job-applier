import asyncio
import json
from pathlib import Path

from applicant_profile import ApplicantProfile
from db import init_db, pending_easy_apply_jobs, save_jobs, update_status
from job_applier import JobApplier
from job_collector import JobCollector


def save_json(path, data):
    path = Path(path)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class RunManager:
    def __init__(self, events, waiters):
        self.events = events
        self.waiters = waiters
        self.task = None
        self.current_run = None
        self.scraped_ids = set()

    def is_running(self):
        return self.task is not None and not self.task.done()

    async def start(self, config):
        if self.is_running():
            raise RuntimeError("A run is already active")
        self.current_run = config
        self.task = asyncio.create_task(self.run(config))

    async def cancel(self):
        if not self.is_running():
            return False
        if self.task is not None:
            self.task.cancel()
        return True

    async def run(self, config):
        await self.events.publish({"type": "run_started", "config": config})
        try:
            init_db()
            await self.scrape(config)
            await self.apply(config)
            await self.events.publish({"type": "run_finished"})
        except asyncio.CancelledError:
            await self.events.publish({"type": "run_cancelled"})
            raise
        except Exception as exc:
            await self.events.publish({"type": "run_failed", "error": str(exc)})

    async def scrape(self, config):
        await self.events.publish({"type": "scrape_started"})
        async with JobCollector(headless=True) as collector:
            jobs = await collector.collect_jobs(
                keywords=config.get("keywords") or None,
                location=config.get("location") or None,
                easy_apply=bool(config.get("easy_apply", False)),
                remote=bool(config.get("remote", False)),
                max_jobs=config.get("max_jobs"),
            )
        save_jobs(jobs)
        save_json("jobs.json", jobs)
        self.scraped_ids = {job["job_id"] for job in jobs}
        await self.events.publish({"type": "scrape_finished", "count": len(jobs)})

    async def apply(self, config):
        profile = ApplicantProfile()
        jobs = [job for job in pending_easy_apply_jobs() if job["job_id"] in self.scraped_ids]
        if config.get("max_apply"):
            jobs = jobs[: int(config["max_apply"])]
        await self.events.publish({"type": "apply_started", "count": len(jobs)})

        async with JobApplier(
            headless=True,
            answer_provider=self.answer_provider,
            submit_approver=self.submit_approver,
            events=self.events,
        ) as applier:
            await applier.ensure_logged_in()
            for job in jobs:
                update_status(job["job_id"], "in_progress")
                await self.events.publish(
                    {
                        "type": "application_started",
                        "job_id": job["job_id"],
                        "title": job["title"],
                        "company": job["company"],
                    }
                )
                try:
                    status, error = await applier.apply_to_job(job, profile)
                except Exception as exc:
                    status, error = "failed", str(exc)
                update_status(job["job_id"], status, error)
                await self.events.publish(
                    {
                        "type": f"application_{status}",
                        "job_id": job["job_id"],
                        "title": job["title"],
                        "company": job["company"],
                        "error": error,
                    }
                )

    async def answer_provider(self, job, questions):
        return await self.waiters.wait_for_answers(
            {
                "job_id": job["job_id"],
                "title": job["title"],
                "company": job["company"],
                "questions": questions,
            }
        )

    async def submit_approver(self, job):
        return await self.waiters.wait_for_submit(
            {
                "job_id": job["job_id"],
                "title": job["title"],
                "company": job["company"],
            }
        )

    def state(self):
        return {
            "running": self.is_running(),
            "current_run": self.current_run,
        }
