export function deriveTags(job: { provider: string; applicationUrl: string | null }): string[] {
    const tags: string[] = [];
    if (job.provider === "linkedin") tags.push("LinkedIn");
    if (job.applicationUrl != null) tags.push("External");
    return tags;
}
