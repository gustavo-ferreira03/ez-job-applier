from collections.abc import AsyncIterator
import re
from pathlib import Path
from typing import Union
from urllib.parse import urljoin, urlencode

from cloakbrowser import launch_async
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from models import Job, RunConfig
from sources.base import JobSource


def clean_text(text):
    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def clean_list_items(texts):
    lines = (clean_text(text).splitlines() for text in texts)
    return [line[0] for line in lines if line]


class LinkedInRateLimitedError(RuntimeError):
    pass


def is_auth_wall(url):
    url = url.lower()
    return any(part in url for part in ("/login", "checkpoint"))


def is_rate_limit_error(exc):
    message = str(exc).lower()
    return "429" in message or "too many requests" in message or "err_http_response_code_failure" in message


def rate_limit_message(url, status=None):
    prefix = f"LinkedIn returned HTTP {status}" if status else "LinkedIn rejected the navigation"
    return (
        f"{prefix} for {url}. This usually means LinkedIn is rate-limiting or temporarily blocking automation. "
        "Stop new runs and wait before retrying."
    )


class LinkedInSession:
    def __init__(self, session_file: Union[str, Path] = "linkedin_session.json", headless=False):
        self.session_file = Path(session_file)
        self.headless = headless
        self._borrowed = False

    async def __aenter__(self):
        self.browser = await launch_async(headless=self.headless, slow_mo=50)
        self.context = await self.browser.new_context(
            storage_state=str(self.session_file) if self.session_file.exists() else None,
            locale="en-US",
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )
        self.context.set_default_timeout(30000)
        self.page = await self.context.new_page()
        return self

    async def __aexit__(self, *_):
        await self.context.close()
        await self.browser.close()

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

    async def goto_linkedin(self, url, **kwargs):
        try:
            response = await self.page.goto(url, **kwargs)
        except PlaywrightError as exc:
            if is_rate_limit_error(exc):
                raise LinkedInRateLimitedError(rate_limit_message(url)) from exc
            raise
        if response and response.status in (429, 999):
            raise LinkedInRateLimitedError(rate_limit_message(url, response.status))
        return response

    async def set_language_english(self):
        await self.goto_linkedin("https://www.linkedin.com/mypreferences/d/language", wait_until="domcontentloaded")
        if is_auth_wall(self.page.url) or "mypreferences" not in self.page.url:
            return False
        select = self.page.locator("select").first
        try:
            await select.wait_for(timeout=10000)
        except PlaywrightTimeoutError:
            return False
        current = await select.input_value()
        if current != "en_US":
            await select.select_option("en_US")
            await self.page.wait_for_url("**/language**", timeout=5000)
        return True

    async def login(self):
        await self.goto_linkedin("https://www.linkedin.com/login", wait_until="domcontentloaded")
        print("Log in to LinkedIn in the browser window.")
        await self.page.wait_for_url(
            lambda url: "/login" not in url and "checkpoint" not in url,
            timeout=120000,
        )
        if not await self.set_language_english():
            raise RuntimeError("LinkedIn login did not produce an authenticated session")
        await self.save_session()

    async def is_logged_in(self):
        await self.goto_linkedin("https://www.linkedin.com/feed/", wait_until="domcontentloaded")
        if is_auth_wall(self.page.url):
            return False
        try:
            await self.page.wait_for_url("**/feed/**", timeout=10000)
            return True
        except PlaywrightTimeoutError:
            return "feed" in self.page.url.lower()

    async def ensure_logged_in(self):
        if self._borrowed:
            return
        if self.session_file.exists() and await self.set_language_english():
            return
        if self.headless:
            await self.login_headful()
            await self.reload_context()
            if not await self.set_language_english():
                raise RuntimeError("LinkedIn login did not produce an authenticated session")
        else:
            await self.login()

    async def login_headful(self):
        async with LinkedInSession(session_file=self.session_file, headless=False) as client:
            await client.login()


class _BorrowedLinkedInSession:
    """Mixin that allows a LinkedInSession subclass to borrow an existing session."""

    def __init__(self, session: "LinkedInSession | None" = None, **kwargs):
        self._external_session = session
        self._borrowed = False
        if session is None:
            super().__init__(**kwargs)

    async def __aenter__(self):
        if self._external_session is not None:
            for attr in ("browser", "context", "session_file", "headless"):
                setattr(self, attr, getattr(self._external_session, attr))
            self.page = await self._borrow_page()
            self._borrowed = True
            return self
        return await super().__aenter__()  # type: ignore[misc]

    async def __aexit__(self, *args):
        if self._external_session is not None:
            await self._release_page()
            return
        return await super().__aexit__(*args)  # type: ignore[misc]

    async def _borrow_page(self):
        assert self._external_session is not None
        return self._external_session.page

    async def _release_page(self):
        pass


class LinkedInSource(_BorrowedLinkedInSession, LinkedInSession, JobSource):
    name = "linkedin"

    async def discover_jobs(self, config: RunConfig) -> AsyncIterator[Job]:
        await self.ensure_logged_in()
        keywords_list = [k.strip() for k in (config.keywords or "").splitlines() if k.strip()] or [None]
        total = 0
        try:
            while True:
                seen_ids: set[str] = set()
                any_found = False
                for keyword in keywords_list:
                    start = 0
                    while True:
                        if config.max_apply is not None and total >= config.max_apply:
                            return
                        await self.open_jobs(
                            keywords=keyword,
                            location=config.location or None,
                            easy_apply=config.easy_apply,
                            work_type=config.work_type,
                            start=start,
                        )
                        remaining = (config.max_apply - total) if config.max_apply else None
                        page_new = 0
                        async for job in self.extract_jobs(max_jobs=remaining, fill_skill_gaps=config.fill_skill_gaps):
                            if job.job_id not in seen_ids:
                                seen_ids.add(job.job_id)
                                total += 1
                                page_new += 1
                                any_found = True
                                yield job
                        if page_new == 0:
                            break
                        start += 25
                if config.max_apply is not None or not any_found:
                    break
                await self.save_session()
        finally:
            await self.save_session()

    async def open_jobs(self, keywords=None, location=None, easy_apply=False, work_type=None, start=0):
        wt_map = {"remote": "2", "hybrid": "3", "onsite": "1"}
        wt_parts = [wt_map[w.strip()] for w in (work_type or "").split(",") if w.strip() in wt_map]
        filters = {
            "keywords": keywords,
            "location": location,
            "f_AL": "true" if easy_apply else None,
            "f_WT": ",".join(wt_parts) if wt_parts else None,
            "start": start or None,
        }
        query = urlencode({k: v for k, v in filters.items() if v})
        url = "https://www.linkedin.com/jobs/search/" + (f"?{query}" if query else "")
        print(f"Opening jobs page: {url}")
        await self.goto_linkedin(url, wait_until="domcontentloaded")
        if is_auth_wall(self.page.url):
            raise RuntimeError("LinkedIn session expired; log in again")
        await self.page.wait_for_timeout(5000)

    async def load_job_ids(self):
        try:
            await self.page.wait_for_selector("li[data-occludable-job-id]", timeout=30000)
        except PlaywrightTimeoutError:
            print("No job cards found")
            return []
        job_ids = []
        for _ in range(30):
            before_count = len(job_ids)
            cards = self.page.locator("li[data-occludable-job-id]")
            for index in range(await cards.count()):
                job_id = await cards.nth(index).get_attribute("data-occludable-job-id")
                if job_id and job_id not in job_ids:
                    job_ids.append(job_id)
            await cards.last.scroll_into_view_if_needed()
            await self.page.mouse.wheel(0, 2000)
            await self.page.wait_for_timeout(1200)
            if len(job_ids) == before_count:
                break
        print(f"Loaded {len(job_ids)} jobs")
        return job_ids

    async def get_application_url(self, detail_pane, easy_apply):
        if easy_apply:
            return None
        apply_control = detail_pane.get_by_role("link").filter(has_text="Apply").first
        if not await apply_control.count():
            apply_control = detail_pane.get_by_role("button").filter(has_text="Apply").first
        if not await apply_control.count():
            return None
        current_url = self.page.url
        try:
            async with self.page.expect_popup(timeout=5000) as popup_info:
                await apply_control.click(timeout=3000)
            popup = await popup_info.value
            await popup.wait_for_load_state("domcontentloaded", timeout=10000)
            application_url = popup.url
            await popup.close()
            return application_url
        except PlaywrightTimeoutError:
            await self.page.wait_for_timeout(2000)
            if self.page.url == current_url:
                return None
            application_url = self.page.url
            await self.page.go_back(wait_until="domcontentloaded")
            await self.page.wait_for_timeout(1000)
            return application_url

    async def get_job_details(self, easy_apply, fill_skill_gaps=False):
        detail_pane = self.page.locator(
            ".jobs-search__job-details--container, .job-view-layout, .jobs-details, .scaffold-layout__detail"
        ).first
        title = (await detail_pane.locator("h1").first.inner_text()).splitlines()[0].strip()
        about_section = detail_pane.locator("article").filter(has_text="About the job").first
        await about_section.locator("p, li").first.wait_for()
        about = await about_section.inner_text()
        preferences, skills = [], []
        skills_btn = detail_pane.get_by_role("button").filter(has_text="skills match").first
        if await skills_btn.count():
            await skills_btn.click()
            modal = self.page.get_by_role("dialog", name="Preferences and skills match")
            await modal.wait_for()
            preferences = clean_list_items(await modal.locator("ul").first.locator("li").all_inner_texts())
            skills_ul = modal.locator("ul").nth(1)
            skills = clean_list_items(await skills_ul.locator("li").all_inner_texts())
            if fill_skill_gaps:
                await self.add_missing_skills(skills_ul)
            await modal.get_by_role("button", name="Dismiss").click()
        application_url = await self.get_application_url(detail_pane, easy_apply)
        return {
            "title": title,
            "preferences": preferences,
            "skills": skills,
            "about": clean_text(about).removeprefix("About the job").strip(),
            "application_url": application_url,
        }

    async def add_missing_skills(self, skills_ul):
        lis = skills_ul.locator("li")
        for idx in range(await lis.count()):
            li = lis.nth(idx)
            add_btn = li.get_by_role("button").filter(has_text=re.compile(r"^add$", re.I)).first
            if not await add_btn.count():
                add_btn = li.locator("button[aria-label*='Add']").first
            if not await add_btn.count():
                continue
            await add_btn.click()
            await self.page.wait_for_timeout(1500)
            dialog = self.page.get_by_role("dialog").last
            if await dialog.count():
                save_btn = dialog.get_by_role("button", name=re.compile(r"save", re.I)).first
                if await save_btn.count():
                    await save_btn.click()
                    await self.page.wait_for_timeout(1000)
                    close_btn = self.page.get_by_role("button", name=re.compile(r"dismiss|close", re.I)).first
                    if await close_btn.count():
                        await close_btn.click()
                        await self.page.wait_for_timeout(500)

    async def extract_jobs(self, max_jobs=None, fill_skill_gaps=False) -> AsyncIterator[Job]:
        count = 0
        job_ids = await self.load_job_ids()
        for job_id in job_ids[:max_jobs]:
            card = self.page.locator(f'li[data-occludable-job-id="{job_id}"]').first
            await card.scroll_into_view_if_needed()
            link = card.locator('a[href*="/jobs/view/"]').first
            title = await link.inner_text()
            href = await link.get_attribute("href")
            labels = [
                text.strip()
                for text in await card.locator(".job-card-container__footer-item").all_inner_texts()
            ]
            if any("applied" == label.lower() for label in labels):
                print(f"Skipping already-applied job: {job_id}")
                continue
            await card.click()
            await self.page.wait_for_timeout(1000)
            easy_apply = any("easy apply" in label.lower() for label in labels)
            job = {
                "job_id": job_id,
                "title": title.splitlines()[0].strip(),
                "company": await card.locator(".artdeco-entity-lockup__subtitle").first.inner_text(),
                "location": await card.locator(".artdeco-entity-lockup__caption").first.inner_text(),
                "url": urljoin("https://www.linkedin.com", href),
                "easy_apply": easy_apply,
            }
            job.update(await self.get_job_details(easy_apply=easy_apply, fill_skill_gaps=fill_skill_gaps))
            count += 1
            extracted = Job.model_validate(job)
            print(f"Extracted {count}: {extracted.title}")
            yield extracted
        print(f"Extracted {count} jobs")
