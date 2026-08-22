import type { APIRoute } from "astro";
import {
	collectPublished,
	DEMO_PAGE_SLUGS,
	lastmodOf,
	siteUrl,
	urlsetXml,
	xmlResponse,
} from "../lib/seo-feeds";

export const GET: APIRoute = async () => {
	const pages = await collectPublished("pages", { exclude: DEMO_PAGE_SLUGS });
	const urls = [
		{ loc: siteUrl("/"), lastmod: undefined },
		{ loc: siteUrl("/posts") },
		{ loc: siteUrl("/guides") },
		...pages.map((page) => ({
			loc: siteUrl(`/${page.slug}`),
			lastmod: lastmodOf(page),
		})),
	];
	return xmlResponse(urlsetXml(urls));
};
