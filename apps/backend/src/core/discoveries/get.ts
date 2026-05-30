import type { AppContext } from "../context";
import type { DiscoveryJob } from "./types";

export async function getDiscovery(id: string, ctx: AppContext): Promise<DiscoveryJob | null> {
    return ctx.discoveryRepo.get(id);
}

export async function listDiscoveries(ctx: AppContext): Promise<DiscoveryJob[]> {
    return ctx.discoveryRepo.list();
}
