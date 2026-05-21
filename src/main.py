import asyncio
import json
from pathlib import Path

from job_collector import JobCollector


def save_json(path, data):
    path = Path(path)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(data)} jobs to: {path.resolve()}")

async def main():
    async with JobCollector() as collector:
        jobs = await collector.collect_jobs(
            keywords="python developer junior",
            location="Brazil",
        )
    save_json("jobs.json", jobs)


if __name__ == "__main__":
    asyncio.run(main())
