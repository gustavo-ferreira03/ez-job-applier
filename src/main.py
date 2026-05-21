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
    print(f"Saved {len(data)} jobs to: {path.resolve()}")

async def main():
    init_db()

    async with JobCollector() as collector:
        jobs = await collector.collect_jobs(
            keywords="python developer junior",
            location="Brazil",
            max_jobs=3,
        )

    save_jobs(jobs)
    save_json("jobs.json", jobs)

    profile = ApplicantProfile()
    scraped_ids = {job["job_id"] for job in jobs}
    pending_jobs = [job for job in pending_easy_apply_jobs() if job["job_id"] in scraped_ids]

    async with JobApplier() as applier:
        await applier.ensure_logged_in()
        for job in pending_jobs:
            try:
                status, error = await applier.apply_to_job(job, profile)
            except Exception as exc:
                status, error = "failed", str(exc)
            update_status(job["job_id"], status, error)


if __name__ == "__main__":
    asyncio.run(main())
