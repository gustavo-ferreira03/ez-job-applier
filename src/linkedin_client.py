import re
from pathlib import Path
from urllib.parse import urljoin, urlencode

from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright
from playwright_stealth import Stealth


def clean_text(text):
    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())

def clean_list_items(texts):
    lines = (clean_text(text).splitlines() for text in texts)
    return [line[0] for line in lines if line]


class LinkedInClient:
    def __init__(self, session_file="linkedin_session.json", headless=False):
        self.session_file = Path(session_file)
        self.headless = headless

    async def __aenter__(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=self.headless, slow_mo=50)
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

    async def load_job_ids(self):
        await self.page.wait_for_selector("li[data-occludable-job-id]", timeout=30000)

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

        apply_control = detail_pane.get_by_role("link").filter(has_text="Candidat").first
        if not await apply_control.count():
            apply_control = detail_pane.get_by_role("button").filter(has_text="Candidat").first
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

    async def get_job_details(self, easy_apply):
        detail_pane = self.page.locator(".jobs-search__job-details--container, .job-view-layout, .jobs-details, .scaffold-layout__detail").first
        title = (await detail_pane.locator("h1").first.inner_text()).splitlines()[0].strip()
        about_section = detail_pane.locator("article").filter(has_text="Sobre a vaga").first
        await about_section.locator("p, li").first.wait_for()
        about = await about_section.inner_text()
        await detail_pane.get_by_role("button").filter(has_text="Corresponde").first.click()

        modal = self.page.get_by_role("dialog", name="Correspondência de preferências e competências")
        await modal.wait_for()
        preferences = clean_list_items(await modal.locator("ul").first.locator("li").all_inner_texts())
        skills = clean_list_items(await modal.locator("ul").nth(1).locator("li").all_inner_texts())
        await modal.get_by_role("button", name="Fechar").click()
        application_url = await self.get_application_url(detail_pane, easy_apply)

        return {
            "title": title,
            "preferences": preferences,
            "skills": skills,
            "about": clean_text(about).removeprefix("Sobre a vaga").strip(),
            "application_url": application_url,
        }

    async def extract_jobs(self, max_jobs=None):
        jobs = []
        job_ids = await self.load_job_ids()

        for job_id in job_ids[:max_jobs]:
            card = self.page.locator(f'li[data-occludable-job-id="{job_id}"]').first
            await card.scroll_into_view_if_needed()

            link = card.locator('a[href*="/jobs/view/"]').first
            title = await link.inner_text()
            href = await link.get_attribute("href")
            labels = [text.strip() for text in await card.locator(".job-card-container__footer-item").all_inner_texts()]

            await card.click()
            await self.page.wait_for_timeout(1000)

            easy_apply = any("candidatura simplificada" in label.lower() for label in labels)
            job = {
                "job_id": job_id,
                "title": title.splitlines()[0].strip(),
                "company": await card.locator(".artdeco-entity-lockup__subtitle").first.inner_text(),
                "location": await card.locator(".artdeco-entity-lockup__caption").first.inner_text(),
                "url": urljoin("https://www.linkedin.com", href),
                "easy_apply": easy_apply,
            }
            job.update(await self.get_job_details(easy_apply=easy_apply))

            jobs.append(job)
            print(f"Extracted {len(jobs)}: {jobs[-1]['title']}")

        print(f"Extracted {len(jobs)} jobs")
        return jobs

    async def collect_jobs(self, max_jobs=None, **filters):
        await self.ensure_logged_in()
        await self.open_jobs(**filters)
        jobs = await self.extract_jobs(max_jobs=max_jobs)
        await self.save_session()
        return jobs
