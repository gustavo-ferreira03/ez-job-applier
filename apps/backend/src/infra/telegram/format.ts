import type { ApplicationQuestion } from "../../core/types";

export const OPTION_PLACEHOLDERS = ["Selecionar opção", "Select an option"];

function visibleOptions(question: ApplicationQuestion): string[] {
    return (question.options ?? []).filter((o) => !OPTION_PLACEHOLDERS.includes(o));
}

export function formatEasyApplyForm(title: string, company: string, questions: ApplicationQuestion[]): string {
    const lines = [
        `Action needed — ${title} @ ${company}`,
        "",
        "Reply to this message with your answers, numbered:",
    ];
    questions.forEach((question, index) => {
        const type = question.fieldType ? ` [${question.fieldType}]` : "";
        lines.push(`${index + 1}) ${question.label}${type}`);
        const options = visibleOptions(question);
        if (options.length) lines.push(`   options: ${options.join(" | ")}`);
    });
    lines.push("", "Example: 1) Yes  2) 5");
    return lines.join("\n");
}

export function formatEasyApplyReview(title: string, company: string, questions: ApplicationQuestion[]): string {
    const lines = [`Ready to submit — ${title} @ ${company}`, ""];
    for (const question of questions) {
        if (question.answer && question.answer.trim()) lines.push(`• ${question.label}: ${question.answer.trim()}`);
    }
    lines.push("", "Submit this application?");
    return lines.join("\n");
}

export function formatAgentMessage(title: string, question: string, phase: "waiting" | "review"): string {
    const header = phase === "review" ? `Approve submit — ${title}` : `Agent needs you — ${title}`;
    return [header, "", question].join("\n");
}
