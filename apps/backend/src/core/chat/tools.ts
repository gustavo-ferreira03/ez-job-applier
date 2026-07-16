import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import type { AppContext } from "../context";
import type { ApplicationStatus } from "../types";
import { addManualJob } from "../jobs/add-manual";
import { tailorResume, tailorResumeToPosting } from "../resumes/tailor";
import { generateResumePdf, resumeOutputName } from "../resumes/pdf";
import { saveAttachment } from "./attachments";
import type { ChatAttachment } from "./types";
import { getSettings } from "../../repositories/settings";
import { getQuestions } from "../applications/get-questions";
import { applyToJob } from "../applications/apply";
import { startExternalApplyForJob } from "../execution/external-apply/worker";

function textResult(text: string) {
    return { content: [{ type: "text" as const, text }], details: undefined, terminate: false };
}

async function attachResumePdf(
    resume: Awaited<ReturnType<typeof tailorResumeToPosting>>,
    collect: (attachment: ChatAttachment) => void,
): Promise<string> {
    const name = resumeOutputName(resume);
    const pdf = await generateResumePdf(resume, name);
    const attachment = await saveAttachment(pdf, `${name}.pdf`, "application/pdf");
    collect(attachment);
    return attachment.filename;
}

const READABLE_STATUSES: ApplicationStatus[] = [
    "FOUND",
    "NEEDS_INPUT",
    "READY_FOR_REVIEW",
    "APPROVED",
    "SUBMITTED",
    "REJECTED",
    "FAILED",
];

export function createChatTools(ctx: AppContext, _threadId: string, collect: (attachment: ChatAttachment) => void = () => {}) {
    const pipeline_status = defineTool({
        name: "pipeline_status",
        label: "pipeline_status",
        description:
            "Read the current job pipeline. Returns counts per status and, optionally, the jobs in a given status (id, title, company). Use this to answer any question about what is in the pipeline instead of guessing.",
        parameters: Type.Object({
            status: Type.Optional(
                Type.Union(
                    READABLE_STATUSES.map((s) => Type.Literal(s)),
                    { description: "Restrict the listing to one status. Omit to get only the counts." },
                ),
            ),
        }),
        async execute(_id, params) {
            const counts: Record<string, number> = {};
            for (const s of READABLE_STATUSES) {
                const ids = await ctx.appRepo.listIdsByStatus(s);
                counts[s] = ids.length;
            }
            let listing = "";
            if (params.status) {
                const ids = await ctx.appRepo.listIdsByStatus(params.status as ApplicationStatus);
                const rows: string[] = [];
                for (const id of ids.slice(0, 25)) {
                    const job = await ctx.jobRepo.getById(id);
                    if (job) rows.push(`#${id} ${job.title} @ ${job.company}`);
                }
                listing = `\n\n${params.status} (${ids.length}):\n${rows.join("\n") || "(none)"}`;
            }
            const summary = READABLE_STATUSES.map((s) => `${s}: ${counts[s]}`).join(", ");
            return textResult(`Pipeline counts — ${summary}.${listing}`);
        },
    });

    const ingest_job = defineTool({
        name: "ingest_job",
        label: "ingest_job",
        description:
            "Add a job from a URL the user pasted (LinkedIn link, or any external ATS link like Greenhouse/Lever/Gupy/Recru). This opens a real browser to read the posting, so it takes a few seconds. It returns the job's numeric id plus the title, company and whether the description was actually read. Report those real values back to the user — never invent them. If it reports the description could not be read, say so plainly instead of claiming success.",
        parameters: Type.Object({
            url: Type.String({ description: "The job posting URL exactly as the user pasted it" }),
        }),
        async execute(_id, params) {
            try {
                const { status, jobId } = await addManualJob(params.url, ctx, { awaitScrape: true });
                if (status === "exists") {
                    const existingId = jobId ? ` (id ${jobId})` : "";
                    return textResult(`That job is already in the pipeline${existingId}.`);
                }
                if (!jobId) return textResult("I added the job but could not resolve its id. Ask the user to check the pipeline.");
                const job = await ctx.jobRepo.getById(jobId);
                if (!job) return textResult("I added the job but could not read it back.");
                const about = (job.about ?? "").trim();
                if (!about) {
                    return textResult(
                        `Added job id ${jobId} (${job.url}), but I could NOT read the posting text — the page may be protected or empty. ` +
                            `Tell the user plainly that the description is missing, so tailoring is not possible yet. Do not claim it worked.`,
                    );
                }
                return textResult(
                    [
                        `Added job id ${jobId} and read the posting successfully.`,
                        `Title: ${job.title}`,
                        `Company: ${job.company || "(not stated)"}`,
                        `Location: ${job.location || "(not stated)"}`,
                        job.skills.length ? `Skills: ${job.skills.join(", ")}` : "",
                        `Description (first 600 chars): ${about.slice(0, 600)}`,
                    ]
                        .filter(Boolean)
                        .join("\n"),
                );
            } catch (e) {
                return textResult(`I couldn't add that URL: ${String(e)}`);
            }
        },
    });

    const job_details = defineTool({
        name: "job_details",
        label: "job_details",
        description:
            "Read the full stored details of one job by its numeric id: title, company, location, skills, application URL and the full description. Use this to answer questions about a job in the chat instead of telling the user to open the pipeline.",
        parameters: Type.Object({ jobId: Type.Number() }),
        async execute(_id, params) {
            const job = await ctx.jobRepo.getById(params.jobId);
            if (!job) return textResult(`No job with id ${params.jobId}.`);
            const app = await ctx.appRepo.get(job.provider, job.jobId);
            const about = (job.about ?? "").trim();
            return textResult(
                [
                    `Job ${params.jobId} — ${job.title} @ ${job.company || "(unknown)"}`,
                    `Status: ${app?.status ?? "unknown"}`,
                    `Location: ${job.location || "(not stated)"}`,
                    `Route: ${job.applicationUrl ? `external ATS (${job.applicationUrl})` : "LinkedIn Easy Apply"}`,
                    job.skills.length ? `Skills: ${job.skills.join(", ")}` : "",
                    about ? `Description:\n${about.slice(0, 3000)}` : "Description: (none stored — the posting was never read)",
                ]
                    .filter(Boolean)
                    .join("\n"),
            );
        },
    });

    const read_resume = defineTool({
        name: "read_resume",
        label: "read_resume",
        description:
            "Read the candidate's master résumé. Call with no name to read it when only one exists (or to list them when there are several); pass a name to read a specific one. Returns the full résumé as YAML. Use this whenever the user asks anything about what is in their résumé — you CAN see it through this tool.",
        parameters: Type.Object({
            name: Type.Optional(Type.String({ description: "Master résumé name; omit to use the only one" })),
        }),
        async execute(_id, params) {
            const masters = await ctx.resumeMasterRepo.listMasters();
            if (masters.length === 0) return textResult("There is no master résumé saved yet. The user can add one under Settings.");
            const name = params.name ?? (masters.length === 1 ? masters[0] : undefined);
            if (!name) return textResult(`Several master résumés exist: ${masters.join(", ")}. Ask which one, then call again with its name.`);
            const yaml = await ctx.resumeMasterRepo.readMaster(name);
            if (!yaml) return textResult(`No master résumé named "${name}". Available: ${masters.join(", ")}.`);
            return textResult(`Master résumé "${name}":\n\n${yaml}`);
        },
    });

    const tailor_resume = defineTool({
        name: "tailor_resume",
        label: "tailor_resume",
        description:
            "Tailor the user's résumé to a specific job already in the pipeline, by its numeric id (get ids from pipeline_status). Optional flexibility overrides the saved default: 1 conservative, 2 balanced, 3 aggressive, 4 maximum. Returns which master résumé was used; the tailored PDF is then available on that job.",
        parameters: Type.Object({
            jobId: Type.Number({ description: "Numeric pipeline id of the job" }),
            flexibility: Type.Optional(Type.Number({ description: "1..4; omit to use the saved default" })),
        }),
        async execute(_id, params) {
            const job = await ctx.jobRepo.getById(params.jobId);
            if (!job) return textResult(`No job with id ${params.jobId} is in the pipeline.`);
            const about = (job.about ?? "").trim();
            if (!about) {
                return textResult(
                    `REFUSED: job ${params.jobId} ("${job.title}") has no description stored, so tailoring would adapt the résumé to nothing. ` +
                        `Tell the user the posting could not be read and that tailoring is not possible for this job yet. Do NOT claim you tailored it.`,
                );
            }
            try {
                const settings = await getSettings();
                const flexibility =
                    params.flexibility && params.flexibility >= 1 && params.flexibility <= 4
                        ? params.flexibility
                        : settings.llm.resumeTailoringFlexibility;
                const { master } = await tailorResume(
                    params.jobId,
                    ctx,
                    undefined,
                    settings.llm.resumeTailoringInstructions,
                    flexibility,
                );
                const tailored = await ctx.resumeMasterRepo.readTailored(params.jobId);
                const filename = tailored ? await attachResumePdf(tailored, collect) : null;
                return textResult(
                    `Tailored the résumé for "${job.title}" @ ${job.company || "(unknown)"} using master "${master}" at flexibility ${flexibility}.` +
                        (filename ? ` The PDF "${filename}" is attached to this reply.` : ""),
                );
            } catch (e) {
                return textResult(`I couldn't tailor for job ${params.jobId}: ${String(e)}`);
            }
        },
    });

    const apply_easy_apply = defineTool({
        name: "apply_easy_apply",
        label: "apply_easy_apply",
        description:
            "Apply to a LinkedIn Easy Apply job (a job WITHOUT an external application URL) by its numeric id. TWO-PHASE: first call with confirmed=false to load the questions and preview what will be submitted; relay that to the user and get an explicit yes. Only call with confirmed=true after the user agreed. With confirmed=true it saves the answers and approves the job for submission — the running execution then submits it (so an execution must be running for it to go out). Fill `answers` as a map of question label -> answer for any questions that need input; every question must be answered or approval fails.",
        parameters: Type.Object({
            jobId: Type.Number(),
            confirmed: Type.Boolean({ description: "false to preview, true to approve+submit. Never set true without an explicit user yes." }),
            answers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "question label -> answer" })),
        }),
        async execute(_id, params) {
            const job = await ctx.jobRepo.getById(params.jobId);
            if (!job) return textResult(`No job with id ${params.jobId}.`);
            if (job.applicationUrl != null) {
                return textResult("That job has an external application URL — use apply_external, not Easy Apply.");
            }
            const app = await ctx.appRepo.get(job.provider, job.jobId);
            if (!app) return textResult(`No application record for job ${params.jobId}.`);

            if (!params.confirmed) {
                await getQuestions(params.jobId, ctx).catch(() => null);
                const questions = await ctx.appRepo.getQuestions(app.id);
                const qList = questions.map((q) => `- ${q.label}${q.answer ? ` (saved: ${q.answer})` : ""}`).join("\n");
                return textResult(
                    `Ready to apply to "${job.title}" @ ${job.company} via Easy Apply.` +
                        (qList ? `\nQuestions:\n${qList}` : "\nNo extra questions detected.") +
                        `\nAsk the user to confirm before submitting, and provide answers for any unanswered questions.`,
                );
            }

            try {
                await applyToJob(params.jobId, params.answers ?? {}, ctx);
                return textResult(
                    `Approved "${job.title}" @ ${job.company} for submission. The running execution will submit it shortly; if no execution is running, tell the user to start one.`,
                );
            } catch (e) {
                return textResult(`I couldn't approve it: ${String(e)}`);
            }
        },
    });

    const apply_external = defineTool({
        name: "apply_external",
        label: "apply_external",
        description:
            "Start the browser agent to apply to an EXTERNAL job (a job WITH an external application URL), by its numeric id. TWO-PHASE: call with confirmed=false to preview and get the user's explicit yes; only call confirmed=true after they agree. With confirmed=true it launches the browser agent, which opens its own live view and asks the user again before the final submit. Tell the user to watch the external-apply panel.",
        parameters: Type.Object({
            jobId: Type.Number(),
            confirmed: Type.Boolean({ description: "false to preview, true to start. Never true without an explicit user yes." }),
        }),
        async execute(_id, params) {
            const job = await ctx.jobRepo.getById(params.jobId);
            if (!job) return textResult(`No job with id ${params.jobId}.`);
            if (job.applicationUrl == null) {
                return textResult("That job is Easy Apply — use apply_easy_apply, not apply_external.");
            }
            if (!params.confirmed) {
                return textResult(
                    `Ready to start the browser agent for "${job.title}" @ ${job.company} (${job.applicationUrl}). Ask the user to confirm before I start.`,
                );
            }
            const result = await startExternalApplyForJob(params.jobId, ctx);
            return textResult(
                result.started
                    ? `Started applying to "${job.title}". Watch the external-apply panel; the agent will ask you before the final submit.`
                    : `I couldn't start it right now (${result.reason ?? "unavailable"}). Try again shortly.`,
            );
        },
    });

    const generate_resume = defineTool({
        name: "generate_resume",
        label: "generate_resume",
        description:
            "Generate a résumé PDF that is not tied to any pipeline job, and attach it to your reply. Call with no role/description to render the master résumé as-is. Pass role and optionally description to adapt it to a target the user described in chat, without creating a job. The PDF is attached to the conversation; do not invent a download URL.",
        parameters: Type.Object({
            role: Type.Optional(Type.String({ description: "Target role, e.g. 'senior backend engineer in Go'" })),
            description: Type.Optional(Type.String({ description: "Longer target description or requirements pasted by the user" })),
            flexibility: Type.Optional(Type.Number({ description: "1..4; omit to use the saved default" })),
            master: Type.Optional(Type.String({ description: "Master résumé name; omit to use the only one" })),
        }),
        async execute(_id, params) {
            const masters = await ctx.resumeMasterRepo.listMasters();
            if (masters.length === 0) return textResult("There is no master résumé saved yet, so I have nothing to generate from.");
            const chosen = params.master ?? (masters.length === 1 ? masters[0] : undefined);
            if (!chosen) return textResult(`Several master résumés exist: ${masters.join(", ")}. Ask which one, then call again with its name.`);
            const master = await ctx.resumeMasterRepo.readMasterParsed(chosen);
            if (!master) return textResult(`Could not read master résumé "${chosen}". Available: ${masters.join(", ")}.`);

            try {
                const target = (params.role ?? "").trim();
                const detail = (params.description ?? "").trim();
                if (!target && !detail) {
                    const filename = await attachResumePdf(master, collect);
                    return textResult(`Rendered the master résumé "${chosen}" as-is. The PDF "${filename}" is attached to this reply.`);
                }
                const settings = await getSettings();
                const flexibility =
                    params.flexibility && params.flexibility >= 1 && params.flexibility <= 4
                        ? params.flexibility
                        : settings.llm.resumeTailoringFlexibility;
                const tailored = await tailorResumeToPosting(
                    { title: target || "Target role", about: detail || target || null },
                    master,
                    ctx,
                    settings.llm.resumeTailoringInstructions,
                    flexibility,
                    "ad-hoc",
                );
                const filename = await attachResumePdf(tailored, collect);
                return textResult(
                    `Generated a résumé from master "${chosen}" aimed at "${target || detail.slice(0, 60)}" at flexibility ${flexibility}. This was not saved to any job. The PDF "${filename}" is attached to this reply.`,
                );
            } catch (e) {
                return textResult(`I couldn't generate the résumé: ${String(e)}`);
            }
        },
    });

    return [pipeline_status, ingest_job, job_details, read_resume, generate_resume, tailor_resume, apply_easy_apply, apply_external];
}
