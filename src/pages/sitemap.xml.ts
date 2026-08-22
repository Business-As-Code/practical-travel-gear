import type { APIRoute } from "astro";
import {
	collectPublished,
	lastmodOf,
	siteUrl,
	sitemapIndexXml,
	xmlResponse,
} from "../lib/seo-feeds";

export const GET: APIRoute = async () => {
	const [posts, guides, pages] = await Promise.all([
		collectPublished("posts"),
		collectPublished("guides"),
		collectPublished("pages"),
	]);

	const newest = (...dates: Array<string | undefined>) =>
		dates.filter(Boolean).sort().at(-1);

	const body = sitemapIndexXml([
		{
			loc: siteUrl("/sitemap-posts.xml"),
			lastmod: newest(...posts.map(lastmodOf)),
		},
		{
			loc: siteUrl("/sitemap-guides.xml"),
			lastmod: newest(...guides.map(lastmodOf)),
		},
		{
			loc: siteUrl("/sitemap-pages.xml"),
			lastmod: newest(...pages.map(lastmodOf)),
		},
	]);

	return xmlResponse(body);
};
