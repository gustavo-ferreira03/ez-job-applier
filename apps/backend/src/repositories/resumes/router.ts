import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import path from "node:path";
import { getDefaultResume, setDefaultResume } from "./services/settings";
import {
    deleteResume,
    listResumes,
    resumeExists,
    saveResume,
} from "./services/storage";

const router = new Hono();

router.get("/", async (c) => {
    const [files, defaultResume] = await Promise.all([
        listResumes(),
        getDefaultResume(),
    ]);
    return c.json({ files, default: defaultResume });
});

router.post("/", async (c) => {
    const body = await c.req.parseBody();

    const entry = Object.entries(body).find(([, v]) => v instanceof File);
    if (!entry) {
        throw new HTTPException(400, { message: "Nenhum arquivo enviado" });
    }

    const [key, value] = entry;
    const file = new File([await (value as File).arrayBuffer()], key, { type: "application/pdf" });

    if (!file.name.toLowerCase().endsWith(".pdf")) {
        throw new HTTPException(400, { message: "Apenas arquivos PDF são aceitos" });
    }

    const filename = await saveResume(file);
    return c.json({ filename });
});

router.post("/default", async (c) => {
    const { filename } = await c.req.json<{ filename: string | null }>();

    if (filename !== null) {
        const safe = path.basename(filename);
        if (!(await resumeExists(safe))) {
            throw new HTTPException(404, { message: "Arquivo não encontrado" });
        }
        await setDefaultResume(safe);
    } else {
        await setDefaultResume(null);
    }

    return c.json({ ok: true });
});

router.delete("/:filename", async (c) => {
    const safe = path.basename(c.req.param("filename"));

    await deleteResume(safe).catch(() => {
        throw new HTTPException(404, { message: "Arquivo não encontrado" });
    });

    const current = await getDefaultResume();
    if (current === safe) await setDefaultResume(null);

    return c.json({ ok: true });
});

export default router;
