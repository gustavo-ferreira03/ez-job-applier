import fs from "node:fs/promises";
import path from "node:path";

export const RESUMES_DIR = path.resolve("storage/resumes");

export async function listResumes(): Promise<string[]> {
    await fs.mkdir(RESUMES_DIR, { recursive: true });
    const files = await fs.readdir(RESUMES_DIR);
    return files.filter((f) => !f.startsWith("."));
}

export async function saveResume(file: File): Promise<string> {
    await fs.mkdir(RESUMES_DIR, { recursive: true });
    const filename = path.basename(file.name);
    await fs.writeFile(
        path.join(RESUMES_DIR, filename),
        Buffer.from(await file.arrayBuffer()),
    );
    return filename;
}

export async function deleteResume(filename: string): Promise<void> {
    await fs.unlink(path.join(RESUMES_DIR, path.basename(filename)));
}

export async function resumeExists(filename: string): Promise<boolean> {
    return fs
        .access(path.join(RESUMES_DIR, path.basename(filename)))
        .then(() => true)
        .catch(() => false);
}
