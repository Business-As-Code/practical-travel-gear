const PRIVATE_COOKIES = /(?:^|;\s*)(?:astro-session|emdash-edit-mode|emdash_session|emdash_preview)=/;
const CONTENT_TAGS = ["posts", "guides", "pages", "emdash:settings", "emdash:menu:social", "emdash:taxonomy:tag", "emdash:taxonomy:category", "emdash:widget-area:footer"];

export function cachePolicy(request: Request): { maxAge: number } | null {
	const url = new URL(request.url);
	if (request.method !== "GET" || request.headers.has("authorization") ||
		PRIVATE_COOKIES.test(request.headers.get("cookie") ?? "") ||
		url.searchParams.has("_preview") || url.searchParams.has("preview") ||
		url.pathname.startsWith("/_") || url.pathname.startsWith("/api/")) return null;
	const listing = /^(?:\/(?:posts|pages|guides|search)?\/?|\/(?:category|tag)\/[^/]+\/?|\/rss\.xml)$/;
	const feed = /^\/(?:sitemap(?:-(?:posts|pages|guides))?\.xml|llms\.txt|robots\.txt)$/;
	const content = /^(?:\/[^/._]+\/?|\/(?:posts|pages|guides)\/[^/]+\/?)$/;
	const maxAge = listing.test(url.pathname) ? 300 : feed.test(url.pathname) || content.test(url.pathname) ? 3600 : 0;
	return maxAge ? { maxAge } : null;
}

/** Native Workers cache serves hits without invoking this Worker. Its tags are
 * invalidated by EmDash through the Astro Cloudflare cache provider. */
export function applyCachePolicy(request: Request, response: Response): Response {
	const result = new Response(response.body, response);
	const policy = cachePolicy(request);
	const control = response.headers.get("Cloudflare-CDN-Cache-Control") ?? response.headers.get("Cache-Control") ?? "";
	const originControl = response.headers.get("Cache-Control") ?? "";
	const type = response.headers.get("Content-Type") ?? "";
	const privateResponse = response.status !== 200 || response.headers.has("Set-Cookie") ||
		/\b(private|no-store|no-cache)\b/i.test(control) || /\b(private|no-store)\b/i.test(originControl) ||
		(response.headers.get("Vary") ?? "").split(",").some(v => v.trim() && v.trim().toLowerCase() !== "accept-encoding");
	if (!policy || privateResponse || !/(?:text\/html|text\/plain|(?:text|application)\/(?:rss\+)?xml)/.test(type)) {
		// Preserve explicit caching for public image/media responses only.
		const publicMedia = request.method === "GET" && !request.headers.has("authorization") &&
			!PRIVATE_COOKIES.test(request.headers.get("cookie") ?? "") && !privateResponse && /^(?:image|audio|video)\//.test(type) && /\bpublic\b/i.test(control);
		if (publicMedia) result.headers.append("Vary", "Cookie, Authorization");
		if (!publicMedia) {
			result.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
			result.headers.set("Cache-Control", "private, no-store");
		}
		return result;
	}
	const existingAge = /(?:^|,)\s*s-maxage=(\d+)/i.exec(control) ?? /(?:^|,)\s*max-age=(\d+)/i.exec(control);
	const maxAge = existingAge ? Math.min(Number(existingAge[1]), policy.maxAge) : policy.maxAge;
	result.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
	result.headers.set("Cloudflare-CDN-Cache-Control", maxAge > 0 ? `public, max-age=${maxAge}` : "no-store");
	// The sidebar and footer share these dependencies across public pages. SQL
	// feeds also need collection tags because they do not use the CMS loader.
	const tags = new Set((result.headers.get("Cache-Tag") ?? "").split(",").filter(Boolean));
	for (const tag of CONTENT_TAGS) tags.add(tag);
	result.headers.set("Cache-Tag", [...tags].join(","));
	// Native cache hits run before fetch/middleware. Public responses MUST
	// key these headers too; no-store on private requests alone is too late.
	result.headers.append("Vary", "Cookie, Authorization");
	result.headers.set("X-PTG-Cache-Version", "4");
	return result;
}

export async function invalidateMediaWrite(request: Request, response: Response,
	purge: (options: { tags: string[] }) => Promise<{ success: boolean }>,
): Promise<void> {
	if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && response.ok &&
		new URL(request.url).pathname.startsWith("/_emdash/api/media/")) {
		// EmDash can replace original bytes at the same URL. Purge variants and
		// pages that carry image metadata after the authenticated route succeeds.
		const result = await purge({ tags: ["media", ...CONTENT_TAGS] });
		if (!result.success) console.error("Media cache purge failed");
	}
}
