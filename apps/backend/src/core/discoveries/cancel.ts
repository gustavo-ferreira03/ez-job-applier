import { db } from "../../db/client";
import { discoveries } from "../../db/schema";
import { eq } from "drizzle-orm";
import { cancelWorker } from "./worker";

export async function cancelDiscovery(id: string): Promise<boolean> {
    const [row] = await db
        .select()
        .from(discoveries)
        .where(eq(discoveries.id, id))
        .limit(1);

    if (!row || row.status !== "running") return false;

    cancelWorker(id);
    return true;
}
