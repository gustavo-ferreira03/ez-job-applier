import type { AppContext } from "../context";
import { getSettings, updateSettings } from "../../repositories/settings";
import { readGithubToken } from "../../repositories/github-auth";
import { githubClient } from "../../infra/GithubClient";

export async function syncGithubRepo(ctx: AppContext, repo: string): Promise<string[]> {
    const token = await readGithubToken();
    if (!token) throw new Error("GitHub not connected");

    const { resumes, templates } = await githubClient.fetchResumeCiRepository(token, repo);
    if (resumes.length === 0) throw new Error("No resumes/*.yml found in repository");

    const settings = await getSettings();
    const previous = settings.advanced.github.masters;
    const next = resumes.map((r) => r.name);

    for (const stale of previous.filter((m) => !next.includes(m))) {
        await ctx.resumeMasterRepo.deleteMaster(stale);
    }
    for (const r of resumes) {
        await ctx.resumeMasterRepo.writeMaster(r.name, r.yaml);
    }
    for (const t of templates) {
        await ctx.resumeMasterRepo.writeTemplate(t.name, t.typ);
    }

    await updateSettings({
        advanced: {
            github: {
                ...settings.advanced.github,
                repo,
                lastSyncedAt: new Date().toISOString(),
                masters: next,
            },
        },
    });

    return next;
}
