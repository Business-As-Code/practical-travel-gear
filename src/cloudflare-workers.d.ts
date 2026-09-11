declare module "cloudflare:workers" {
	export const cache: import("@cloudflare/workers-types").CacheContext;
	export const env: { DB: import("@cloudflare/workers-types").D1Database };
}
