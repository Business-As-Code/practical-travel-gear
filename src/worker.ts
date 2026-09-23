import handler, { createScheduledHandler } from "@emdash-cms/cloudflare/worker";
import { handleImg, type ImgEnv } from "./lib/img-transform";
import { cache } from "cloudflare:workers";
import { applyCachePolicy, invalidateMediaWrite } from "./lib/edge-cache";
export { PluginBridge } from "@emdash-cms/cloudflare/worker";

export default {
	...handler,
	async fetch(request: Request, env: ImgEnv, ctx: { waitUntil(promise: Promise<unknown>): void }) {
		if (new URL(request.url).pathname === "/img") return applyCachePolicy(request, await handleImg(request, env));
		const response = await handler.fetch!(request, env, ctx);
		await invalidateMediaWrite(request, response, options => cache.purge(options)).catch(() => console.error("Media cache purge failed"));
		return applyCachePolicy(request, response);
	},
	scheduled: createScheduledHandler({ generalCron: "*/5 * * * *" }),
};
