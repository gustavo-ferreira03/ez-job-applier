import re

from playwright.async_api import Error as PlaywrightError

from linkedin_client import LinkedInClient


class JobApplier(LinkedInClient):
    async def apply_to_job(self, job, profile):
        await self.page.goto(job["url"], wait_until="domcontentloaded")
        await self.page.wait_for_timeout(2000)

        easy_apply = self.page.get_by_role("link").filter(has_text="Easy Apply").first
        if not await easy_apply.count():
            easy_apply = self.page.get_by_role("button").filter(has_text="Easy Apply").first
        await easy_apply.click()

        modal = self.page.get_by_role("dialog").last
        await modal.wait_for()

        for _ in range(10):
            await self.fill_step(modal, profile)

            submit = modal.get_by_role("button", name=re.compile("submit application", re.I)).first
            if await submit.count():
                answer = input(f"Submit application for {job['title']} at {job['company']}? (y/n) ").strip().lower()
                if answer != "y":
                    await self.close_modal(modal)
                    return "skipped", None
                await submit.click()
                await self.page.wait_for_timeout(2000)
                return "applied", None

            next_button = modal.get_by_role("button", name=re.compile("next|review", re.I)).first
            if not await next_button.count():
                input("No Next/Review/Submit button found. Fix manually, then press ENTER to continue. ")
                continue

            try:
                await next_button.click()
                await self.page.wait_for_timeout(1000)
            except PlaywrightError:
                input("LinkedIn blocked the next step. Fix manually, then press ENTER to continue. ")

        return "failed", "Reached step limit"

    async def fill_step(self, modal, profile):
        await self.fill_text_fields(modal, profile)
        await self.fill_selects(modal, profile)

    async def fill_text_fields(self, modal, profile):
        fields = modal.locator("input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea")
        for index in range(await fields.count()):
            field = fields.nth(index)
            if not await field.is_visible() or not await field.is_enabled() or await field.input_value():
                continue
            label = await self.field_label(field, f"text field {index + 1}")
            await field.fill(profile.answer_for(label))

    async def fill_selects(self, modal, profile):
        selects = modal.locator("select")
        for index in range(await selects.count()):
            select = selects.nth(index)
            if not await select.is_visible() or not await select.is_enabled():
                continue
            selected = await select.locator("option:checked").inner_text()
            if selected and "select" not in selected.lower() and "selecionar" not in selected.lower():
                continue
            label = await self.field_label(select, f"select field {index + 1}")
            options = await self.select_options(select)
            answer = profile.answer_for(label, options)
            try:
                await select.select_option(label=answer)
            except PlaywrightError:
                input(f"Could not select '{answer}' for '{label}'. Fix manually, then press ENTER. ")

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
