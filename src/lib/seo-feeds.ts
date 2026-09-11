import { env } from "cloudflare:workers";
import { loadFeedEntries } from "./feed-entries";

const SITE = "https://practicaltravelgear.com";

export const DEMO_PAGE_SLUGS = new Set([
	"home",
	"homepage",
	"homepage-copy",
	"ptg-home-v2",
	"home-3-columns",
	"home-carousel",
	"home-classic-sidebar",
	"home-advertising-area",
	"home-grid-with-sidebar",
	"home-minimal",
	"home-posts-carousel",
	"home-posts-slider",
	"home-category-carousel",
	"landing-page",
	"sample-page",
	"gutenberg-blocks",
	"columns",
	"buttons",
	"alert-messages",
	"accordions-and-tabs",
	"features",
	"blog",
]);

export type SitemapUrl = {
	loc: string;
	lastmod?: string;
};

export function siteUrl(path = "/"): string {
	if (!path || path === "/") return `${SITE}/`;
	return `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function escapeXml(str: string): string {
	return str
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export function urlsetXml(urls: SitemapUrl[]): string {
	const body = urls
		.map((u) => {
			const last = u.lastmod
				? `\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>`
				: "";
			return `  <url>\n    <loc>${escapeXml(u.loc)}</loc>${last}\n  </url>`;
		})
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function sitemapIndexXml(sitemaps: SitemapUrl[]): string {
	const body = sitemaps
		.map((u) => {
			const last = u.lastmod
				? `\n    <lastmod>${escapeXml(u.lastmod)}</lastmod>`
				: "";
			return `  <sitemap>\n    <loc>${escapeXml(u.loc)}</loc>${last}\n  </sitemap>`;
		})
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

export function xmlResponse(body: string, maxAge = 3600): Response {
	return new Response(body, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=86400`,
		},
	});
}

export function textResponse(body: string, maxAge = 3600): Response {
	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=86400`,
		},
	});
}

function iso(d: Date | string | null | undefined): string | undefined {
	if (!d) return undefined;
	const date = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(date.getTime())) return undefined;
	return date.toISOString();
}

export async function collectPublished(
	collection: "posts" | "guides" | "pages",
	opts?: { exclude?: Set<string>; limit?: number },
) {
	return loadFeedEntries(env.DB, collection, opts);
}

export function lastmodOf(
	entry: { publishedAt?: Date | string | null; updatedAt?: Date | string | null },
): string | undefined {
	return iso(entry.updatedAt) || iso(entry.publishedAt);
}

export { SITE };
