import handler, { createScheduledHandler } from "@emdash-cms/cloudflare/worker";
import { serveCached } from "./lib/edge-cache";
export { PluginBridge } from "@emdash-cms/cloudflare/worker";

export default {
	...handler,
	fetch(request: Request, env: unknown, ctx: { waitUntil(promise: Promise<unknown>): void }) {
		return serveCached(request, () => Promise.resolve(handler.fetch!(request, env, ctx)), (caches as CacheStorage & { default: Cache }).default, ctx);
	},
	scheduled: createScheduledHandler({ generalCron: "*/5 * * * *" }),
};
