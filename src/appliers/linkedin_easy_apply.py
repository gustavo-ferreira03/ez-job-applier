import re

from playwright.async_api import Error as PlaywrightError

from appliers.base import BaseApplier
from models import AnalyzeResult, Application, ApplicationQuestion, ApplicationStatus, Job, SubmitResult
from sources.linkedin import LinkedInRateLimitedError, LinkedInSession


class LinkedInEasyApplyApplier(LinkedInSession, BaseApplier):
    name = "linkedin_easy_apply"
    priority = 100

    def __init__(self, session: "LinkedInSession | None" = None, **kwargs):
        self._external_session = session
        self._borrowed = False
        if session is None:
            super().__init__(**kwargs)

    async def __aenter__(self):
        if self._external_session is not None:
            self.browser = self._external_session.browser
            self.context = self._external_session.context
            self.page = self._external_session.page
            self.session_file = self._external_session.session_file
            self.headless = self._external_session.headless
            self._borrowed = True
            return self
        return await super().__aenter__()

    async def __aexit__(self, *args):
        if self._external_session is not None:
            return
        return await super().__aexit__(*args)

    def matches(self, job: Job) -> bool:
        return job.easy_apply and "linkedin.com" in job.url.lower()

    async def analyze(
        self,
        application: Application,
        job: Job,
        questions: list[ApplicationQuestion],
    ) -> AnalyzeResult:
        result = await self.run_flow(job, questions, should_submit=False)
        return AnalyzeResult(status=result.status, questions=result.questions, error_message=result.error_message)

    async def submit(
        self,
        application: Application,
        job: Job,
        questions: list[ApplicationQuestion],
    ) -> SubmitResult:
        return await self.run_flow(job, questions, should_submit=True)

    async def run_flow(self, job: Job, questions: list[ApplicationQuestion], should_submit: bool) -> SubmitResult:
        answers = {question.label: question.answer for question in questions if question.answer}
        collected = []
        try:
            await self.ensure_logged_in()
            await self.goto_linkedin(job.url, wait_until="domcontentloaded")
            await self.page.wait_for_timeout(2000)
            easy_apply = self.page.get_by_role("link").filter(has_text="Easy Apply").first
            if not await easy_apply.count():
                easy_apply = self.page.get_by_role("button").filter(has_text="Easy Apply").first
            await easy_apply.click()

            modal = self.page.get_by_role("dialog").last
            await modal.wait_for()

            for _ in range(20):
                pending = []
                await self.fill_text_fields(modal, answers, pending, collected)
                await self.fill_selects(modal, answers, pending, collected)

                if pending:
                    await self.close_modal(modal)
                    return SubmitResult(status=ApplicationStatus.NEEDS_ANSWERS, questions=collected + pending)

                submit = modal.get_by_role("button", name=re.compile("submit application", re.I)).first
                if await submit.count():
                    if should_submit:
                        await submit.click()
                        await self.page.wait_for_timeout(2000)
                        return SubmitResult(status=ApplicationStatus.SUBMITTED, questions=collected)
                    await self.close_modal(modal)
                    return SubmitResult(status=ApplicationStatus.READY_FOR_REVIEW, questions=collected)

                next_button = modal.get_by_role("button", name=re.compile("next|review", re.I)).first
                if not await next_button.count():
                    await self.close_modal(modal)
                    return SubmitResult(
                        status=ApplicationStatus.FAILED,
                        questions=collected,
                        error_message="No Next/Review/Submit button found",
                    )

                await next_button.click()
                await self.page.wait_for_timeout(1000)

            await self.close_modal(modal)
            return SubmitResult(
                status=ApplicationStatus.FAILED,
                questions=collected,
                error_message="Reached step limit",
            )
        except LinkedInRateLimitedError:
            await self.close_open_modal()
            raise
        except Exception as exc:
            await self.close_open_modal()
            return SubmitResult(status=ApplicationStatus.FAILED, questions=collected, error_message=str(exc))

    async def fill_text_fields(self, modal, answers, pending, collected):
        fields = modal.locator("input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea")
        for index in range(await fields.count()):
            field = fields.nth(index)
            if not await field.is_visible() or not await field.is_enabled():
                continue
            label = await self.field_label(field, f"text field {index + 1}")
            current_value = await field.input_value()
            answer = answers.get(label)
            if answer:
                if current_value != answer:
                    await field.fill(answer)
                collected.append(ApplicationQuestion(label=label, answer=answer, field_type="text"))
            elif current_value:
                collected.append(ApplicationQuestion(label=label, answer=current_value, field_type="text"))
            else:
                pending.append(ApplicationQuestion(label=label, field_type="text"))

    async def fill_selects(self, modal, answers, pending, collected):
        selects = modal.locator("select")
        for index in range(await selects.count()):
            select = selects.nth(index)
            if not await select.is_visible() or not await select.is_enabled():
                continue
            label = await self.field_label(select, f"select field {index + 1}")
            options = await self.select_options(select)
            selected = (await select.locator("option:checked").inner_text()).strip()
            answer = answers.get(label)
            if answer:
                try:
                    await select.select_option(label=answer)
                except PlaywrightError:
                    pending.append(ApplicationQuestion(label=label, field_type="select", options=options))
                    continue
                collected.append(ApplicationQuestion(label=label, answer=answer, field_type="select", options=options))
                continue
            if selected and "select" not in selected.lower() and "selecionar" not in selected.lower():
                collected.append(ApplicationQuestion(label=label, answer=selected, field_type="select", options=options))
            else:
                pending.append(ApplicationQuestion(label=label, field_type="select", options=options))

    async def select_options(self, select):
        options = []
        option_elements = select.locator("option")
        for index in range(await option_elements.count()):
            option = option_elements.nth(index)
            label = (await option.inner_text()).strip()
            value = await option.get_attribute("value")
            if label and value:
                options.append(label)
        return options

    async def field_label(self, field, fallback):
        for attr in ("aria-label", "placeholder", "name"):
            value = await field.get_attribute(attr)
            if value:
                return value.strip()
        text = await field.locator("xpath=ancestor::div[1]").inner_text()
        if text.strip():
            return text.splitlines()[0].strip().removesuffix("*")
        return fallback

    async def close_modal(self, modal):
        close = modal.get_by_role("button", name=re.compile("dismiss|close", re.I)).first
        if await close.count():
            await close.click()
            discard = self.page.get_by_role("button", name=re.compile("discard", re.I)).first
            if await discard.count():
                await discard.click()

    async def close_open_modal(self):
        if not hasattr(self, "page"):
            return
        modal = self.page.get_by_role("dialog").last
        if await modal.count():
            await self.close_modal(modal)
