import type { APIRoute } from "astro";
import { siteUrl, sitemapIndexXml, xmlResponse } from "../lib/seo-feeds";

export const GET: APIRoute = async () => {
	// Index only — do not page every collection here. lastmod on child
	// sitemaps is enough; collecting 1,500+ posts made this route time out
	// after the 0.34 deploy.
	const body = sitemapIndexXml([
		{ loc: siteUrl("/sitemap-posts.xml") },
		{ loc: siteUrl("/sitemap-guides.xml") },
		{ loc: siteUrl("/sitemap-pages.xml") },
	]);
	return xmlResponse(body);
};
