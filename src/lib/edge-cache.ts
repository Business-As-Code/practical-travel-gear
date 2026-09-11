const CACHE_VERSION = "2";
const TRACKING_PARAMETERS = new Set(["gclid", "dclid", "fbclid", "msclkid", "mc_cid", "mc_eid"]);
const PRIVATE_COOKIES = /(?:^|;\s*)(?:astro-session|emdash-edit-mode|emdash_session|emdash_preview)=/;

export function cachePolicy(request: Request): { key: Request; maxAge: number } | null {
	const url = new URL(request.url);
	if (request.method !== "GET" || request.headers.has("authorization") ||
		PRIVATE_COOKIES.test(request.headers.get("cookie") ?? "") ||
		url.searchParams.has("_preview") || url.searchParams.has("preview") ||
		url.pathname.startsWith("/_") || url.pathname.startsWith("/api/")) return null;

	const listing = /^(?:\/(?:posts|pages|guides|search)?\/?|\/(?:category|tag)\/[^/]+\/?|\/rss\.xml)$/;
	const feed = /^\/(?:sitemap(?:-(?:posts|pages|guides))?\.xml|llms\.txt|robots\.txt)$/;
	const content = /^(?:\/[^/._]+\/?|\/(?:posts|pages|guides)\/[^/]+\/?)$/;
	const maxAge = listing.test(url.pathname) ? 300 : feed.test(url.pathname) || content.test(url.pathname) ? 3600 : 0;
	if (!maxAge) return null;

	for (const key of [...url.searchParams.keys()]) {
		if (key.startsWith("utm_") || TRACKING_PARAMETERS.has(key)) url.searchParams.delete(key);
	}
	// Separate from old middleware entries. Preserve real search/pagination keys.
	url.searchParams.set("__ptg_cache", CACHE_VERSION);
	return { key: new Request(url), maxAge };
}

type ResponseCache = Pick<Cache, "match" | "put">;
type BackgroundContext = { waitUntil(promise: Promise<unknown>): void };

export async function serveCached(
	request: Request,
	render: () => Promise<Response>,
	cache: ResponseCache | undefined,
	ctx: BackgroundContext,
): Promise<Response> {
	const policy = cachePolicy(request);
	if (!policy || !cache) return render();

	const hit = await cache.match(policy.key);
	if (hit) {
		const response = new Response(hit.body, hit);
		response.headers.set("X-Edge-Cache", "hit");
		response.headers.set("Server-Timing", 'edge;dur=0;desc="Response cache hit; CMS not invoked"');
		return response;
	}

	const response = await render();
	const control = response.headers.get("cache-control") ?? "";
	const type = response.headers.get("content-type") ?? "";
	if (response.status !== 200 || response.headers.has("set-cookie") ||
		/\b(private|no-store|no-cache)\b/i.test(control) ||
		(response.headers.get("vary") ?? "").split(",").some((v) => v.trim() && v.trim().toLowerCase() !== "accept-encoding") ||
		!/(?:text\/html|text\/plain|(?:text|application)\/(?:rss\+)?xml)/.test(type)) return response;

	const existingAge = /(?:^|,)\s*s-maxage=(\d+)/i.exec(control);
	const maxAge = existingAge ? Math.min(Number(existingAge[1]), policy.maxAge) : policy.maxAge;
	if (maxAge <= 0) return response;
	const result = new Response(response.body, response);
	result.headers.set("Cache-Control", `public, max-age=0, s-maxage=${maxAge}`);
	result.headers.set("X-Edge-Cache", "miss");
	result.headers.set("X-PTG-Cache-Version", CACHE_VERSION);
	// A cache failure must not turn a valid public page into an error.
	ctx.waitUntil(cache.put(policy.key, result.clone()).catch(() => console.error("Public page cache write failed")));
	return result;
}
