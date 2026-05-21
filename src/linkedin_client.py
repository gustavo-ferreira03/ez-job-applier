from pathlib import Path
from typing import Union

from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright
from playwright_stealth import Stealth


class LinkedInClient:
    def __init__(self, session_file: Union[str, Path] = "linkedin_session.json", headless=True):
        self.session_file = Path(session_file)
        self.headless = headless

    async def __aenter__(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=self.headless, slow_mo=50)
        self.context = await self.browser.new_context(
            storage_state=str(self.session_file) if self.session_file.exists() else None,
            locale="en-US",
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
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

    async def reload_context(self):
        await self.context.close()
        self.context = await self.browser.new_context(
            storage_state=str(self.session_file) if self.session_file.exists() else None,
            locale="en-US",
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        self.context.set_default_timeout(30000)
        self.page = await self.context.new_page()
        await Stealth().apply_stealth_async(self.page)

    async def set_language_english(self):
        await self.page.goto("https://www.linkedin.com/mypreferences/d/language", wait_until="domcontentloaded")
        select = self.page.locator("select").first
        current = await select.evaluate("el => el.value")
        if current != "en_US":
            await select.select_option("en_US")
            await self.page.wait_for_url("**/language**", timeout=5000)

    async def login(self):
        await self.page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded")
        print("Log in to LinkedIn in the browser window.")
        await self.page.wait_for_url(
            lambda url: "/login" not in url and "checkpoint" not in url,
            timeout=120000,
        )
        await self.set_language_english()
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
            if self.headless:
                await self.login_headful()
                await self.reload_context()
                await self.set_language_english()
            else:
                await self.login()
        else:
            await self.set_language_english()

    async def login_headful(self):
        async with LinkedInClient(session_file=self.session_file, headless=False) as client:
            await client.login()
