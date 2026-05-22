import re

from playwright.async_api import Error as PlaywrightError

from linkedin_client import LinkedInClient
from waiters import WaiterTimeout


class NeedsInput(Exception):
    pass


class ReadyToSubmit(Exception):
    pass


class SkippedByUser(Exception):
    pass


class JobApplier(LinkedInClient):
    def __init__(self, *args, answer_provider=None, submit_approver=None, events=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.answer_provider = answer_provider
        self.submit_approver = submit_approver
        self.events = events

    async def apply_to_job(self, job, profile):
        applied_answers = []
        try:
            await self.page.goto(job["url"], wait_until="domcontentloaded")
            await self.page.wait_for_timeout(2000)

            easy_apply = self.page.get_by_role("link").filter(has_text="Easy Apply").first
            if not await easy_apply.count():
                easy_apply = self.page.get_by_role("button").filter(has_text="Easy Apply").first
            await easy_apply.click()

            modal = self.page.get_by_role("dialog").last
            await modal.wait_for()

            for _ in range(20):
                await self.fill_step(modal, profile, job, applied_answers)

                submit = modal.get_by_role("button", name=re.compile("submit application", re.I)).first
                if await submit.count():
                    result = await self.confirm_submit(job, applied_answers)
                    decision = result if isinstance(result, str) else result.get("decision")
                    if decision == "edit":
                        new_answers = {} if isinstance(result, str) else result.get("answers", {})
                        key_to_question = {profile.key(a["question"]): a["question"] for a in applied_answers}
                        for q_key, new_ans in new_answers.items():
                            question_text = key_to_question.get(q_key)
                            if question_text and new_ans:
                                profile.set_answer(question_text, new_ans)
                        back = modal.locator("button[aria-label='Back to previous step']").first
                        if not await back.count():
                            back = modal.get_by_role("button", name=re.compile(r"^back", re.I)).first
                        if await back.count():
                            await back.click()
                            await self.page.wait_for_timeout(1000)
                            applied_answers.clear()
                            continue
                        await self.close_modal(modal)
                        return "skipped", None, applied_answers
                    if decision != "approve":
                        await self.close_modal(modal)
                        return "skipped", None, applied_answers
                    await submit.click()
                    await self.page.wait_for_timeout(2000)
                    return "applied", None, applied_answers

                next_button = modal.get_by_role("button", name=re.compile("next|review", re.I)).first
                if not await next_button.count():
                    await self.close_modal(modal)
                    return "failed", "No Next/Review/Submit button found", applied_answers

                try:
                    await next_button.click()
                    await self.page.wait_for_timeout(1000)
                except PlaywrightError as exc:
                    await self.close_modal(modal)
                    return "failed", str(exc), applied_answers

            return "failed", "Reached step limit", applied_answers
        except SkippedByUser:
            await self.close_open_modal()
            return "skipped", None, applied_answers
        except NeedsInput as exc:
            await self.close_open_modal()
            return "needs_input", str(exc), applied_answers
        except ReadyToSubmit:
            await self.close_open_modal()
            return "ready_to_submit", None, applied_answers

    async def fill_step(self, modal, profile, job, applied_answers):
        pending = []
        await self.fill_text_fields(modal, profile, pending, applied_answers)
        await self.fill_selects(modal, profile, pending, applied_answers)
        if pending:
            await self.fill_pending_fields(profile, job, pending, applied_answers)

    async def fill_text_fields(self, modal, profile, pending, applied_answers):
        fields = modal.locator("input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea")
        for index in range(await fields.count()):
            field = fields.nth(index)
            if not await field.is_visible() or not await field.is_enabled():
                continue
            label = await self.field_label(field, f"text field {index + 1}")
            answer = profile.get_answer(label)
            current_value = await field.input_value()
            if current_value:
                if answer and answer != current_value:
                    await field.fill(answer)
                    applied_answers.append({"question": label, "answer": answer})
                continue
            if answer:
                await field.fill(answer)
                applied_answers.append({"question": label, "answer": answer})
            else:
                pending.append({"field": field, "question": label, "field_type": "text", "options": []})

    async def fill_selects(self, modal, profile, pending, applied_answers):
        selects = modal.locator("select")
        for index in range(await selects.count()):
            select = selects.nth(index)
            if not await select.is_visible() or not await select.is_enabled():
                continue
            selected = (await select.locator("option:checked").inner_text()).strip()
            label = await self.field_label(select, f"select field {index + 1}")
            options = await self.select_options(select)
            answer = profile.get_answer(label, options)
            already_selected = selected and "select" not in selected.lower() and "selecionar" not in selected.lower()
            if already_selected:
                if answer and answer != selected:
                    try:
                        await select.select_option(label=answer)
                        applied_answers.append({"question": label, "answer": answer})
                    except PlaywrightError:
                        pass
                continue
            if not answer:
                pending.append({"field": select, "question": label, "field_type": "select", "options": options})
                continue
            try:
                await select.select_option(label=answer)
                applied_answers.append({"question": label, "answer": answer})
            except PlaywrightError:
                raise NeedsInput(f"Invalid answer '{answer}' for '{label}'")

    async def fill_pending_fields(self, profile, job, pending, applied_answers):
        if not self.answer_provider:
            raise NeedsInput(", ".join(item["question"] for item in pending))
        questions = [
            {
                "question": item["question"],
                "question_key": profile.key(item["question"]),
                "field_type": item["field_type"],
                "options": item["options"],
            }
            for item in pending
        ]
        try:
            answers = await self.answer_provider(job, questions)
        except WaiterTimeout as exc:
            raise NeedsInput(", ".join(item["question"] for item in pending)) from exc
        if answers is None:
            raise SkippedByUser()

        for item in pending:
            key = profile.key(item["question"])
            answer = answers.get(key)
            if not answer:
                raise NeedsInput(item["question"])
            profile.set_answer(item["question"], answer)
            applied_answers.append({"question": item["question"], "answer": answer})
            if item["field_type"] == "select":
                try:
                    await item["field"].select_option(label=answer)
                except PlaywrightError:
                    raise NeedsInput(f"Invalid answer '{answer}' for '{item['question']}'")
            else:
                await item["field"].fill(answer)

    async def confirm_submit(self, job, applied_answers):
        if not self.submit_approver:
            raise ReadyToSubmit
        try:
            return await self.submit_approver(job, applied_answers)
        except WaiterTimeout as exc:
            raise ReadyToSubmit from exc

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
        modal = self.page.get_by_role("dialog").last
        if await modal.count():
            await self.close_modal(modal)
