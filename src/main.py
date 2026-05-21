import asyncio
import json
from pathlib import Path

from linkedin_client import LinkedInClient


def save_json(path, data):
    path = Path(path)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(data)} jobs to: {path.resolve()}")


async def main():
    async with LinkedInClient() as linkedin:
        jobs = await linkedin.collect_jobs(
            keywords="python developer junior",
            location="Brazil",
        )

    save_json("jobs.json", jobs)


if __name__ == "__main__":
    asyncio.run(main())
