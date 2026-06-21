import type { ApplicationQuestion, Job } from "../../core/types";

export const OPTION_PLACEHOLDERS = ["Selecionar opção", "Select an option"];

function visibleOptions(question: ApplicationQuestion): string[] {
    return (question.options ?? []).filter((o) => !OPTION_PLACEHOLDERS.includes(o));
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function link(label: string, url: string | null | undefined): string | null {
    if (!url) return null;
    return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}

function formatJobHeader(job: Job): string[] {
    const lines = [`<b>${escapeHtml(job.title)}</b>`, ""];
    if (job.company) lines.push(`Company: ${escapeHtml(job.company)}`);
    if (job.location) lines.push(`Location: ${escapeHtml(job.location)}`);
    const jobLink = link("Job posting", job.url);
    if (jobLink) lines.push(`Link: ${jobLink}`);
    const applyLink = link("Application form", job.applicationUrl);
    if (applyLink) lines.push(`Apply: ${applyLink}`);
    if (job.preferences.length) lines.push(`Preferences: ${escapeHtml(job.preferences.join(", "))}`);
    if (job.skills.length) lines.push(`Skills: ${escapeHtml(job.skills.join(", "))}`);
    return lines;
}

export function formatEasyApplyForm(job: Job, questions: ApplicationQuestion[]): string {
    const lines = [
        ...formatJobHeader(job),
        "",
        "Action needed: answer these Easy Apply questions.",
        "Reply to this message with your answers, numbered:",
    ];
    questions.forEach((question, index) => {
        const type = question.fieldType ? ` [${question.fieldType}]` : "";
        lines.push(`${index + 1}) ${escapeHtml(question.label)}${type}`);
        const options = visibleOptions(question);
        if (options.length) lines.push(`   options: ${escapeHtml(options.join(" | "))}`);
    });
    lines.push("", "Example: 1) Yes  2) 5");
    return lines.join("\n");
}

export function formatEasyApplyReview(job: Job, questions: ApplicationQuestion[]): string {
    const lines = [...formatJobHeader(job), "", "Ready to submit this Easy Apply application.", ""];
    for (const question of questions) {
        if (question.answer && question.answer.trim()) lines.push(`• ${escapeHtml(question.label)}: ${escapeHtml(question.answer.trim())}`);
    }
    lines.push("", "Submit this application?");
    return lines.join("\n");
}

export function formatAgentMessage(job: Job, question: string, phase: "waiting" | "review"): string {
    const action = phase === "review" ? "Agent is asking for submit approval." : "Agent needs your input.";
    return [...formatJobHeader(job), "", action, "", escapeHtml(question)].join("\n");
}
