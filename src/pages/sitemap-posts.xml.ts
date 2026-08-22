import type { APIRoute } from "astro";
import {
	collectPublished,
	lastmodOf,
	siteUrl,
	urlsetXml,
	xmlResponse,
} from "../lib/seo-feeds";

export const GET: APIRoute = async () => {
	const posts = await collectPublished("posts");
	const body = urlsetXml(
		posts.map((post) => ({
			loc: siteUrl(`/${post.slug}`),
			lastmod: lastmodOf(post),
		})),
	);
	return xmlResponse(body);
};
