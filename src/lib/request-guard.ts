type QuotaNamespace = { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
export type GuardEnv = { SEARCH_LIMITER: QuotaNamespace };

export function isScannerPath(path: string): boolean {
	try { path = decodeURIComponent(path); } catch { return true; }
	path = path.toLowerCase();
	// Uploaded originals and WordPress media URLs can contain arbitrary names.
	if (path.startsWith('/_emdash/api/media/file/') || path.startsWith('/wp-content/uploads/')) return false;
	return /(?:^|\/)\.git(?:\/|$)/.test(path) ||
		/(?:^|\/)(?:[^/]*\.)?env(?:[.\/-]|$)/.test(path) ||
		/(?:^|\/)\.env(?:[.\/-]|$)/.test(path) ||
		/\.php\d*(?:\/|$)/.test(path) ||
		/^\/wp-admin(?:\/|$)/.test(path);
}

function refusal(status: number, message: string, retry?: number): Response {
	return Response.json({ error: { message } }, { status, headers: {
		'Cache-Control': 'private, no-store',
		'Cloudflare-CDN-Cache-Control': 'no-store',
		...(retry ? { 'Retry-After': String(retry) } : {}),
	} });
}

/** Runs before CMS initialization and D1. No cookies, UA claims or auth headers
 * exempt public searches; those are trivially forged by a scraper. */
export async function guardRequest(request: Request, env: GuardEnv): Promise<Response | null> {
	const url = new URL(request.url);
	if (isScannerPath(url.pathname)) return refusal(403, 'Forbidden');
	const path = url.pathname.replace(/\/$/, '');
	if (!['/search', '/_emdash/api/search', '/_emdash/api/search/suggest'].includes(path) ||
		!['GET', 'HEAD'].includes(request.method)) return null;
	const query = url.searchParams.get('q')?.trim() ?? '';
	if (!query) return null;
	if (query.length > 200 || (url.searchParams.get('cursor')?.length ?? 0) > 1024) {
		return refusal(400, 'Search query is too long');
	}
	// Cloudflare supplies this header on ingress; never use spoofable X-Forwarded-For.
	const ip = request.headers.get('CF-Connecting-IP');
	try {
		// Some ingress transforms remove visitor IP headers. Those requests
		// share a conservative fallback quota instead of bypassing protection.
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip ?? 'unknown'));
		const key = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
		const object = env.SEARCH_LIMITER.get(env.SEARCH_LIMITER.idFromName('public-search'));
		const response = await object.fetch(new Request('https://quota/check', { method: 'POST', body: JSON.stringify({ key }) }));
		if (!response.ok) throw new Error('Quota check failed');
		if (!(await response.json() as { success: boolean }).success) {
			return refusal(429, 'Too many searches. Please try again in a minute.', 60);
		}
	} catch {
		console.error('Search rate limiter unavailable');
		return refusal(503, 'Search is temporarily unavailable. Please try again.', 10);
	}
	return null;
}
