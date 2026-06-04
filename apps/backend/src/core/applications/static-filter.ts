import type { Job } from "../types";
import type { GeneralSettings } from "../../repositories/settings";

function wordRegex(term: string): RegExp {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i");
}

export function checkStaticFilter(
    job: Job,
    general: GeneralSettings,
): { blocked: true; reason: string } | { blocked: false } {
    for (const company of general.blockedCompanies ?? []) {
        if (wordRegex(company).test(job.company)) {
            return { blocked: true, reason: `Blocked company: ${company}` };
        }
    }

    const searchText = [job.title, job.about ?? "", ...job.skills].join(" ");
    for (const keyword of general.blockedKeywords ?? []) {
        if (wordRegex(keyword).test(searchText)) {
            return { blocked: true, reason: `Blocked keyword: ${keyword}` };
        }
    }

    return { blocked: false };
}
