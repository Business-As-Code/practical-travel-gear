/** Serve the 404 page at the original URL (no 302 to /404). */
export function rewriteNotFound(astro: {
	rewrite: (url: string | URL | Request) => Promise<Response>;
}): Promise<Response> {
	return astro.rewrite("/404");
}
