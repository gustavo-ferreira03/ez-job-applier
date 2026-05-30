import { cancelWorker } from "./worker";
import type { AppContext } from "../context";

export async function cancelDiscovery(id: string, ctx: AppContext): Promise<boolean> {
    const record = await ctx.discoveryRepo.get(id);
    if (!record || record.status !== "running") return false;
    cancelWorker(id);
    return true;
}
