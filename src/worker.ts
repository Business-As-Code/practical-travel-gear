import handler, { createScheduledHandler } from "@emdash-cms/cloudflare/worker";
import { cache } from "cloudflare:workers";
import { applyCachePolicy, invalidateMediaWrite } from "./lib/edge-cache";
export { PluginBridge } from "@emdash-cms/cloudflare/worker";

export default {
	...handler,
	async fetch(request: Request, env: unknown, ctx: { waitUntil(promise: Promise<unknown>): void }) {
		const response = await handler.fetch!(request, env, ctx);
		await invalidateMediaWrite(request, response, options => cache.purge(options)).catch(() => console.error("Media cache purge failed"));
		return applyCachePolicy(request, response);
	},
	scheduled: createScheduledHandler({ generalCron: "*/5 * * * *" }),
};
