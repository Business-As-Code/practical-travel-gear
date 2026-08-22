import type { APIRoute } from "astro";
import {
	collectPublished,
	lastmodOf,
	siteUrl,
	urlsetXml,
	xmlResponse,
} from "../lib/seo-feeds";

export const GET: APIRoute = async () => {
	const guides = await collectPublished("guides");
	const body = urlsetXml(
		guides.map((guide) => ({
			loc: siteUrl(`/guides/${guide.slug}`),
			lastmod: lastmodOf(guide),
		})),
	);
	return xmlResponse(body);
};
