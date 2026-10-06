import worker from "./worker";
import { fetchWithRuntimeRetry } from "./lib/runtime-retry";
import { guardRequest, type GuardEnv } from "./lib/request-guard";

export { PluginBridge } from "./worker";
export { PublicSearchLimiter } from "./lib/search-limiter";

// Preserve the CMS entry point, scheduled publisher and native cache policy.
export default {
	...worker,
	async fetch(request: Request, env: Parameters<typeof worker.fetch>[1] & GuardEnv,
		ctx: Parameters<typeof worker.fetch>[2]) {
		return await guardRequest(request, env) ?? fetchWithRuntimeRetry(request, () => worker.fetch(request, env, ctx));
	},
};
