import type { Locator, Page } from "playwright-core";
import type { ApplicationQuestion } from "./types";
import type { EasyApplyConfig } from "./types";
import type { ApplyResult as EasyApplyResult } from "../../../core/types";

const MAX_STEPS = 20;

function cleanLabel(raw: string): string {
    const lines = raw.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    // Deduplicate consecutive identical lines (LinkedIn sometimes renders label twice)
    const deduped = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
    return deduped.join(" ").replace(/\s*\*\s*$/, "").trim();
}

async function fieldLabel(field: Locator, fallback: string): Promise<string> {
    for (const attr of ["aria-label", "placeholder", "name"]) {
        const value = await field.getAttribute(attr);
        if (value?.trim()) return value.trim();
    }

    // Try associated <label> element via id
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

    // Walk up one div and grab first line of text
    const ancestor = field.locator("xpath=ancestor::div[1]");
    if (await ancestor.count()) {
        const text = await ancestor.innerText();
        const first = text.trim().split("\n")[0].trim();
        if (first) return first.replace(/\s*\*\s*$/, "").trim();
    }

    return fallback;
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
        const checkedOption = select.locator("option:checked");
        const selected = (await checkedOption.count())
            ? (await checkedOption.innerText()).trim()
            : "";
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

        const isPlaceholder = !selected || selected.toLowerCase().includes("select");

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
                // best effort
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
            // best effort
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

        // Find and click the Easy Apply button
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
        // Close any open modal before returning
        try {
            const modal = page.getByRole("dialog").last();
            if (await modal.count()) await closeModal(page, modal);
        } catch {
            // ignore cleanup errors
        }
        return {
            status: "FAILED",
            questions: collected,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
}
