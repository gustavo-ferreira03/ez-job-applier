import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import type { VncSession } from "../../login/vnc";
import { takeBrowserScreenshot, type BrowserMcp } from "./mcp";
import { askUser, postAgentMessage } from "./state";
import { rememberAgentFact } from "./memory";
import { saveAgentExternalAttachment, type ExternalApplyAttachment } from "./persistence";

export interface JobToolContext {
    jobId: number;
    workDir: string;
    vncSession: VncSession | null;
    toolCalls: number;
    aborted: boolean;
    approvedOnce: boolean;
    finishStatus: "submitted" | "aborted" | null;
    ensureVnc: () => Promise<VncSession>;
    browser: BrowserMcp | null;
    lastUrl: string | null;
    fingerprintArgs: string[] | null;
}

function textResult(text: string, terminate = false) {
    return { content: [{ type: "text" as const, text }], details: undefined, terminate };
}

function isFinalSubmitQuestion(question: string, nextAction: string): boolean {
    if (nextAction === "final_submit") return true;
    return /\b(submit|enviar|finalizar|mandar)\b|\bapply\s+(now|button|application)\b|\b(clicar|click)\b.*\b(submit|apply|enviar|finalizar)\b/i.test(question);
}

async function saveAttachments(jc: JobToolContext, paths: string[] | undefined): Promise<ExternalApplyAttachment[]> {
    const attachments: ExternalApplyAttachment[] = [];
    for (const filePath of paths ?? []) {
        attachments.push(await saveAgentExternalAttachment(jc.jobId, jc.workDir, filePath));
    }
    return attachments;
}

export function createExternalApplyTools(jc: JobToolContext) {
    const say = defineTool({
        name: "say",
        label: "say",
        description:
            "Report progress to the user in the chat (non-blocking). Use a short sentence whenever you complete a meaningful step (page opened, a section filled, an obstacle found). Does not pause you.",
        parameters: Type.Object({
            message: Type.String({ description: "A short progress update for the user" }),
            attachments: Type.Optional(Type.Array(Type.String({ description: "Paths to files inside the application work directory" }))),
        }),
        async execute(_id, params) {
            jc.toolCalls += 1;
            const attachments = await saveAttachments(jc, params.attachments);
            postAgentMessage(jc.jobId, params.message, attachments);
            return textResult("Posted.");
        },
    });

    const ask_user = defineTool({
        name: "ask_user",
        label: "ask_user",
        description:
            "Ask the user a question in the chat and wait for their reply. Use when you need information you don't have, are unsure how to proceed, or want confirmation. You MUST call this and get a go-ahead before clicking the final submit/apply button. Set nextAction='final_submit' when the only remaining step is clicking the final submit/apply button; otherwise use nextAction='needs_input'. Set remember=true ONLY when the question is a reusable personal fact that will be the same on every future application (birthdate, CPF, phone, address, salary expectation, work authorization, years of experience); the answer is then saved so no future application asks it again. Leave remember off for job-specific questions (motivation for this company, consent tied to one posting). Returns the user's reply.",
        parameters: Type.Object({
            question: Type.String({ description: "What you need from the user" }),
            nextAction: Type.Union([Type.Literal("needs_input"), Type.Literal("final_submit")]),
            remember: Type.Optional(Type.Boolean({ description: "Save this answer for future applications (reusable personal facts only)" })),
            attachments: Type.Optional(Type.Array(Type.String({ description: "Paths to files inside the application work directory" }))),
        }),
        async execute(_id, params) {
            jc.toolCalls += 1;
            jc.vncSession = await jc.ensureVnc();
            const phase = isFinalSubmitQuestion(params.question, params.nextAction) ? "review" : "waiting";
            const paths = [...(params.attachments ?? [])];
            const screenshotPath = phase === "review" && jc.browser ? await takeBrowserScreenshot(jc.browser, jc.workDir, jc.jobId) : null;
            if (screenshotPath) paths.push(screenshotPath);
            const attachments = await saveAttachments(jc, paths);
            const resolution = await askUser(jc.jobId, params.question, phase, screenshotPath ?? undefined, attachments);
            if (resolution.kind === "stop") {
                jc.aborted = true;
                return textResult(
                    "The user stopped this application. Call finish with status='aborted' and take no further actions.",
                    true,
                );
            }
            if (params.remember) void rememberAgentFact(params.question, resolution.text);
            if (phase === "review") jc.approvedOnce = true;
            return textResult(`The user replied: ${resolution.text}`);
        },
    });

    const finish = defineTool({
        name: "finish",
        label: "finish",
        description: "Signal that the application is complete ('submitted') or that you have stopped ('aborted').",
        parameters: Type.Object({
            status: Type.Union([Type.Literal("submitted"), Type.Literal("aborted")]),
        }),
        async execute(_id, params) {
            jc.toolCalls += 1;
            if (params.status === "submitted" && !jc.approvedOnce) {
                return textResult(
                    "You must use ask_user to get the user's go-ahead before submitting. Ask first.",
                );
            }
            jc.finishStatus = params.status;
            return textResult("Recorded.", true);
        },
    });

    return [say, ask_user, finish];
}
