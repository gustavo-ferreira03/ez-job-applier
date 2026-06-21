const GITHUB_API = "https://api.github.com";

interface GithubContentEntry {
    name: string;
    type: string;
    download_url: string | null;
}

export interface GithubResumeCiRepository {
    resumes: { name: string; yaml: string }[];
    templates: { name: string; typ: string }[];
}

export class GithubClient {
    async getLogin(token: string): Promise<string> {
        const user = await this.request<{ login: string }>(token, "/user");
        return user.login;
    }

    async listRepos(token: string): Promise<string[]> {
        const repos = await this.request<{ full_name: string }[]>(
            token,
            "/user/repos?per_page=100&sort=updated&affiliation=owner",
        );
        return repos.map((r) => r.full_name);
    }

    async fetchResumeCiRepository(token: string, repo: string): Promise<GithubResumeCiRepository> {
        const [resumeEntries, templateEntries] = await Promise.all([
            this.listDirectory(token, repo, "resumes"),
            this.listDirectory(token, repo, "templates"),
        ]);
        const resumes = await Promise.all(
            resumeEntries
                .filter((entry) => entry.type === "file" && /\.ya?ml$/i.test(entry.name) && entry.download_url)
                .map(async (entry) => ({
                    name: entry.name.replace(/\.ya?ml$/i, ""),
                    yaml: await this.fetchText(entry.download_url as string),
                })),
        );
        const templates = await Promise.all(
            templateEntries
                .filter((entry) => entry.type === "file" && entry.name.endsWith(".typ") && entry.download_url)
                .map(async (entry) => ({ name: entry.name, typ: await this.fetchText(entry.download_url as string) })),
        );
        return { resumes, templates };
    }

    async exchangeCodeForToken(code: string): Promise<string> {
        const res = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            }),
        });
        const data = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
        if (!data.access_token) throw new Error(data.error_description ?? data.error ?? "no access_token");
        return data.access_token;
    }

    private async request<T>(token: string, path: string): Promise<T> {
        const res = await fetch(`${GITHUB_API}${path}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "ezjobapplier",
            },
        });
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
        return res.json() as Promise<T>;
    }

    private async listDirectory(token: string, repo: string, dir: string): Promise<GithubContentEntry[]> {
        try {
            return await this.request<GithubContentEntry[]>(token, `/repos/${repo}/contents/${dir}`);
        } catch {
            return [];
        }
    }

    private async fetchText(url: string): Promise<string> {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`GitHub content download failed (${res.status})`);
        return res.text();
    }
}

export const githubClient = new GithubClient();
