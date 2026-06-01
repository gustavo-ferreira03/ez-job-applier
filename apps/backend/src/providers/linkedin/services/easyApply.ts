import type { Locator, Page } from "playwright-core";
import type { ApplicationQuestion } from "./types";
import type { EasyApplyConfig } from "./types";
import type { ApplyResult as EasyApplyResult } from "../../../core/types";

const MAX_STEPS = 20;

function cleanLabel(raw: string): string {
    const lines = raw.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const deduped = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
    return deduped.join(" ").replace(/\s*\*\s*$/, "").trim();
}

function cssAttr(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function sameText(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function fieldLabel(field: Locator, fallback: string): Promise<string> {
    for (const attr of ["aria-label", "placeholder", "name"]) {
        const value = await field.getAttribute(attr);
        if (value?.trim()) return value.trim();
    }

    const id = await field.getAttribute("id");
    if (id) {
        const page = field.page();
        const label = page.locator(`label[for="${id}"]`).first();
        if (await label.count()) {
            const text = await label.innerText();
            const cleaned = cleanLabel(text);
            if (cleaned) return cleaned;
        }
    }

    const ancestor = field.locator("xpath=ancestor::div[1]");
    if (await ancestor.count()) {
        const text = await ancestor.innerText();
        const first = text.trim().split("\n")[0].trim();
        if (first) return first.replace(/\s*\*\s*$/, "").trim();
    }

    return fallback;
}

async function choiceLabel(input: Locator, fallback: string): Promise<string> {
    const id = await input.getAttribute("id");
    if (id) {
        const label = input.page().locator(`label[for="${cssAttr(id)}"]`).first();
        if (await label.count()) {
            const text = cleanLabel(await label.innerText());
            if (text) return text;
        }
    }

    const aria = await input.getAttribute("aria-label");
    if (aria?.trim()) return cleanLabel(aria);

    const labelAncestor = input.locator("xpath=ancestor::label[1]");
    if (await labelAncestor.count()) {
        const text = cleanLabel(await labelAncestor.innerText());
        if (text) return text;
    }

    const value = await input.getAttribute("value");
    return value?.trim() || fallback;
}

async function radioGroupLabel(first: Locator, fallback: string): Promise<string> {
    const fieldset = first.locator("xpath=ancestor::fieldset[1]");
    const legend = fieldset.locator("legend").first();
    if (await legend.count()) {
        const text = cleanLabel(await legend.innerText());
        if (text) return text;
    }

    const radiogroup = first.locator("xpath=ancestor::*[@role='radiogroup'][1]");
    if (await radiogroup.count()) {
        const aria = await radiogroup.getAttribute("aria-label");
        if (aria?.trim()) return cleanLabel(aria);
    }

    const container = first.locator("xpath=ancestor::div[contains(@class, 'form') or contains(@class, 'question') or contains(@class, 'fb-dash-form-element')][1]");
    if (await container.count()) {
        const text = await container.innerText();
        const inputs = container.locator("input[type=radio]");
        const count = await inputs.count();
        const optionTexts = new Set<string>();
        for (let i = 0; i < count; i++) optionTexts.add(await choiceLabel(inputs.nth(i), ""));
        const labelLine = text.trim().split("\n").map((l) => l.trim()).find((l) => l && !optionTexts.has(cleanLabel(l)) && !/please make a selection|additional questions|screening questions/i.test(l));
        if (labelLine) return cleanLabel(labelLine);
    }

    return fallback;
}

async function fillRadioGroups(
    modal: Locator,
    answers: Record<string, string>,
    pending: ApplicationQuestion[],
    collected: ApplicationQuestion[],
): Promise<void> {
    const names = await modal.locator("input[type=radio]").evaluateAll((nodes) => {
        const found = new Set<string>();
        for (const node of nodes) {
            const input = node as HTMLInputElement;
            if (input.name) found.add(input.name);
        }
        return [...found];
    });

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const radios = modal.locator(`input[type=radio][name="${cssAttr(name)}"]`);
        const count = await radios.count();
        if (count === 0) continue;

        const first = radios.first();
        if (!(await first.isEnabled())) continue;

        const label = await radioGroupLabel(first, `radio field ${i + 1}`);
        const options: string[] = [];
        let selected = "";

        for (let j = 0; j < count; j++) {
            const radio = radios.nth(j);
            const option = await choiceLabel(radio, `option ${j + 1}`);
            if (option) options.push(option);
            if (await radio.isChecked()) selected = option;
        }

        const answer = answers[label];
        if (answer) {
            const idx = options.findIndex((option) => sameText(option, answer));
            if (idx >= 0) {
                await radios.nth(idx).check({ force: true });
                collected.push({ label, answer: options[idx], fieldType: "radio", options });
                continue;
            }
        } else if (selected) {
            collected.push({ label, answer: selected, fieldType: "radio", options });
            continue;
        }
        pending.push({ label, fieldType: "radio", options });
    }
}

async function selectOptions(select: Locator): Promise<string[]> {
    const options: string[] = [];
    const elements = select.locator("option");
    const count = await elements.count();
    for (let i = 0; i < count; i++) {
        const label = (await elements.nth(i).innerText()).trim();
        const value = await elements.nth(i).getAttribute("value");
        if (label && value) options.push(label);
    }
    return options;
}

async function fillTextFields(
    modal: Locator,
    answers: Record<string, string>,
    pending: ApplicationQuestion[],
    collected: ApplicationQuestion[],
): Promise<void> {
    const fields = modal.locator(
        "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea",
    );
    const count = await fields.count();
    for (let i = 0; i < count; i++) {
        const field = fields.nth(i);
        if (!(await field.isVisible()) || !(await field.isEnabled())) continue;

        const label = await fieldLabel(field, `text field ${i + 1}`);
        const fieldType = ((await field.getAttribute("type")) ?? "text") as ApplicationQuestion["fieldType"];
        const current = await field.inputValue();
        const answer = answers[label];

        if (answer) {
            if (current !== answer) await field.fill(answer);
            collected.push({ label, answer, fieldType });
        } else if (current) {
            collected.push({ label, answer: current, fieldType });
        } else {
            pending.push({ label, fieldType });
        }
    }
}

async function fillSelects(
    modal: Locator,
    answers: Record<string, string>,
    pending: ApplicationQuestion[],
    collected: ApplicationQuestion[],
): Promise<void> {
    const selects = modal.locator("select");
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
        const select = selects.nth(i);
        if (!(await select.isVisible()) || !(await select.isEnabled())) continue;

        const label = await fieldLabel(select, `select field ${i + 1}`);
        const options = await selectOptions(select);
        const checkedEl = select.locator("option:checked");
        const hasChecked = (await checkedEl.count()) > 0;
        const selected = hasChecked ? (await checkedEl.innerText()).trim() : "";
        const selectedValue = hasChecked ? (await checkedEl.getAttribute("value")) ?? "" : "";
        const isDisabled = hasChecked && await checkedEl.evaluate((el) => (el as HTMLOptionElement).disabled);
        const answer = answers[label];

        if (answer) {
            try {
                await select.selectOption({ label: answer });
                collected.push({ label, answer, fieldType: "select", options });
            } catch {
                pending.push({ label, fieldType: "select", options });
            }
            continue;
        }

        const placeholderWords = ["select", "choose", "selecionar", "seleccionar"];
        const isPlaceholder = !selected || !selectedValue || isDisabled || placeholderWords.some((w) => selected.toLowerCase().includes(w));

        if (!isPlaceholder) {
            collected.push({
                label,
                answer: selected,
                fieldType: "select",
                options,
            });
        } else {
            pending.push({ label, fieldType: "select", options });
        }
    }
}

async function fillFileFields(
    modal: Locator,
    resumePath: string,
): Promise<void> {
    const inputs = modal.locator("input[type=file]");
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
        await inputs.nth(i).setInputFiles(resumePath);
    }
}

async function unfollow(modal: Locator): Promise<void> {
    for (const role of ["checkbox", "switch"] as const) {
        const el = modal
            .getByRole(role, { name: /follow/i })
            .first();
        if (await el.count()) {
            try {
                if (await el.isChecked()) await el.click({ force: true });
            } catch {
            }
            return;
        }
    }
    const label = modal.locator("label").filter({ hasText: /follow/i }).first();
    if (await label.count()) {
        try {
            const cb = label
                .locator("input[type='checkbox'], input[type='radio']")
                .first();
            if ((await cb.count()) && (await cb.isChecked())) {
                await label.click({ force: true });
            }
        } catch {
        }
    }
}

async function closeModal(page: Page, modal: Locator): Promise<void> {
    const close = modal
        .getByRole("button", { name: /dismiss|close/i })
        .first();
    if (await close.count()) {
        await close.click();
        await page.waitForTimeout(500);
        const discard = page
            .getByRole("button", { name: /discard/i })
            .first();
        if (await discard.count()) await discard.click();
    }
}

export async function runEasyApply(
    page: Page,
    jobUrl: string,
    config: EasyApplyConfig = {},
): Promise<EasyApplyResult> {
    const answers = config.answers ?? {};
    const shouldSubmit = config.shouldSubmit ?? false;
    const collected: ApplicationQuestion[] = [];

    try {
        await page.goto(jobUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        let easyApplyBtn = page
            .getByRole("link", { name: /easy apply/i })
            .first();
        if (!(await easyApplyBtn.count())) {
            easyApplyBtn = page
                .getByRole("button", { name: /easy apply/i })
                .first();
        }
        if (!(await easyApplyBtn.count())) {
            return {
                status: "SKIPPED",
                questions: [],
                errorMessage: "No Easy Apply button found",
            };
        }
        await easyApplyBtn.click();

        const modal = page.getByRole("dialog").last();
        try {
            await modal.waitFor({ timeout: 5000 });
        } catch {
            return {
                status: "SKIPPED",
                questions: [],
                errorMessage: "Already applied or modal did not open",
            };
        }

        for (let step = 0; step < MAX_STEPS; step++) {
            const pending: ApplicationQuestion[] = [];

            await fillTextFields(modal, answers, pending, collected);
            await fillSelects(modal, answers, pending, collected);
            await fillRadioGroups(modal, answers, pending, collected);
            if (config.resumePath) await fillFileFields(modal, config.resumePath);

            if (pending.length > 0) {
                await closeModal(page, modal);
                return {
                    status: "NEEDS_INPUT",
                    questions: [...collected, ...pending],
                };
            }

            const submitBtn = modal
                .getByRole("button", { name: /submit application/i })
                .first();
            if (await submitBtn.count()) {
                await unfollow(modal);
                if (shouldSubmit) {
                    await submitBtn.click();
                    await page.waitForTimeout(2000);
                    return { status: "SUBMITTED", questions: collected };
                }
                await closeModal(page, modal);
                return { status: "READY_FOR_REVIEW", questions: collected };
            }

            const nextBtn = modal
                .getByRole("button", { name: /next|review/i })
                .first();
            if (!(await nextBtn.count())) {
                await closeModal(page, modal);
                return {
                    status: "FAILED",
                    questions: collected,
                    errorMessage: "No Next/Review/Submit button found",
                };
            }

            await nextBtn.click();
            await page.waitForTimeout(1000);
        }

        await closeModal(page, modal);
        return {
            status: "FAILED",
            questions: collected,
            errorMessage: "Reached step limit",
        };
    } catch (err) {
        try {
            const modal = page.getByRole("dialog").last();
            if (await modal.count()) await closeModal(page, modal);
        } catch {}
        return {
            status: "FAILED",
            questions: collected,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
}
