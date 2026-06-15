import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import fs from "node:fs/promises";
import path from "node:path";
import {
    listResumes,
    saveResume,
    deleteResume,
    resumeExists,
    RESUMES_DIR,
} from "../repositories/resumes/services/storage";
import {
    getDefaultResume,
    setDefaultResume,
} from "../repositories/resumes/services/settings";

const FilenameParam = z.object({
    filename: z.string().openapi({
        param: { name: "filename", in: "path" },
        example: "meu-cv.pdf",
    }),
});

const router = new OpenAPIHono();

router.openapi(
    createRoute({
        method: "get",
        path: "/resumes",
        tags: ["Resumes"],
        summary: "List uploaded resumes and the current default",
        responses: {
            200: { description: "List of resumes" },
        },
    }),
    async (c) => {
        const [files, defaultResume] = await Promise.all([
            listResumes(),
            getDefaultResume(),
        ]);
        return c.json({ resumes: files, default: defaultResume });
    },
);

router.openapi(
    createRoute({
        method: "post",
        path: "/resumes",
        tags: ["Resumes"],
        summary: "Upload a resume (PDF only)",
        responses: {
            201: { description: "Resume uploaded" },
            400: { description: "Invalid file" },
        },
    }),
    async (c) => {
        const body = await c.req.parseBody();
        const file = body["file"];

        if (!(file instanceof File)) {
            throw new HTTPException(400, { message: "Field 'file' must be a file" });
        }

        if (!file.name.toLowerCase().endsWith(".pdf")) {
            throw new HTTPException(400, { message: "Only PDF files are allowed" });
        }

        const filename = await saveResume(file);
        return c.json({ filename }, 201);
    },
);

router.openapi(
    createRoute({
        method: "post",
        path: "/resumes/default",
        tags: ["Resumes"],
        summary: "Set the default resume",
        request: {
            body: {
                content: {
                    "application/json": {
                        schema: z.object({
                            filename: z.string().nullable().openapi({ example: "meu-cv.pdf" }),
                        }),
                    },
                },
                required: true,
            },
        },
        responses: {
            200: { description: "Default updated" },
            404: { description: "Resume not found" },
        },
    }),
    async (c) => {
        const { filename } = await c.req.json<{ filename: string | null }>();

        if (filename !== null && !(await resumeExists(filename))) {
            throw new HTTPException(404, { message: "Resume not found" });
        }

        await setDefaultResume(filename);
        return c.json({ default: filename });
    },
);

router.openapi(
    createRoute({
        method: "delete",
        path: "/resumes/{filename}",
        tags: ["Resumes"],
        summary: "Delete a resume",
        request: { params: FilenameParam },
        responses: {
            200: { description: "Deleted" },
            404: { description: "Resume not found" },
        },
    }),
    async (c) => {
        const { filename } = c.req.valid("param");

        if (!(await resumeExists(filename))) {
            throw new HTTPException(404, { message: "Resume not found" });
        }

        await deleteResume(filename);

        const defaultResume = await getDefaultResume();
        if (defaultResume === filename) {
            await setDefaultResume(null);
        }

        return c.json({ ok: true });
    },
);

router.get("/resumes/:filename/preview.pdf", async (c) => {
    const filename = path.basename(c.req.param("filename"));
    if (!(await resumeExists(filename))) {
        throw new HTTPException(404, { message: "Resume not found" });
    }

    const pdf = await fs.readFile(path.join(RESUMES_DIR, filename));
    return c.body(new Uint8Array(pdf), 200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
    });
});

export default router;
