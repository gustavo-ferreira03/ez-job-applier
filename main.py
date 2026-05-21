import asyncio
import json
from pathlib import Path
from urllib.parse import urlencode

from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright
from playwright_stealth import Stealth


class LinkedInClient:
    def __init__(self, session_file="linkedin_session.json", headless=False):
        self.session_file = Path(session_file)
        self.headless = headless

    async def __aenter__(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            slow_mo=50,
        )
        self.context = await self.browser.new_context(
            storage_state=str(self.session_file) if self.session_file.exists() else None
        )
        self.context.set_default_timeout(30000)
        self.page = await self.context.new_page()
        await Stealth().apply_stealth_async(self.page)
        return self

    async def __aexit__(self, *_):
        await self.context.close()
        await self.browser.close()
        await self.playwright.stop()

    async def save_session(self):
        await self.context.storage_state(path=str(self.session_file))
        print(f"Session saved to: {self.session_file.resolve()}")

    async def login(self):
        await self.page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded")
        input("Log in to LinkedIn manually, then press ENTER here. ")
        await self.save_session()

    async def is_logged_in(self):
        await self.page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded")

        if any(part in self.page.url.lower() for part in ("/login", "checkpoint")):
            return False

        try:
            await self.page.wait_for_url("**/feed/**", timeout=10000)
            return True
        except PlaywrightTimeoutError:
            return "feed" in self.page.url.lower()

    async def ensure_logged_in(self):
        if not self.session_file.exists() or not await self.is_logged_in():
            await self.login()

    async def open_jobs(self, keywords=None, location=None, easy_apply=False, remote=False):
        filters = {
            "keywords": keywords,
            "location": location,
            "f_AL": "true" if easy_apply else None,
            "f_WT": "2" if remote else None,
        }
        query = urlencode({key: value for key, value in filters.items() if value})
        url = "https://www.linkedin.com/jobs/search/" + (f"?{query}" if query else "")

        print(f"Opening jobs page: {url}")
        await self.page.goto(url, wait_until="domcontentloaded")
        await self.page.wait_for_timeout(5000)

    async def extract_jobs(self):
        return []

    async def collect_jobs(self, **filters):
        await self.ensure_logged_in()
        await self.open_jobs(**filters)
        jobs = await self.extract_jobs()
        await self.save_session()
        return jobs


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
