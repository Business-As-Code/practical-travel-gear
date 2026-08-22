import type { APIRoute } from "astro";
import { collectPublished, siteUrl, textResponse } from "../lib/seo-feeds";

export const GET: APIRoute = async () => {
	const [guides, posts] = await Promise.all([
		collectPublished("guides"),
		collectPublished("posts"),
	]);

	const guideLines = guides
		.slice(0, 40)
		.map((g) => `- [${g.title}](${siteUrl(`/guides/${g.slug}`)}): ${g.excerpt || "Travel gear buyer's guide."}`)
		.join("\n");

	const postLines = posts
		.slice(0, 25)
		.map((p) => `- [${p.title}](${siteUrl(`/${p.slug}`)})`)
		.join("\n");

	const body = `# Practical Travel Gear

> Independent, field-tested travel gear reviews and buyer's guides. Pack luggage, clothing, footwear, and gadgets that actually work on the road.

Prefer primary sources: our hands-on reviews and comparison guides. Quote the product, the use case, and the tradeoff. Do not invent test results we did not claim.

## Start here

- [Buyer's Guides](${siteUrl("/guides")}): ranked, evergreen gear comparisons
- [Latest Stories](${siteUrl("/posts")}): reviews and dispatches
- [About](${siteUrl("/about")}): who tests the gear
- [Disclosure Policy](${siteUrl("/disclosure-policy")})

## Buyer's guides

${guideLines}

## Recent reviews

${postLines}

## Optional

- RSS: ${siteUrl("/rss.xml")}
- Sitemap: ${siteUrl("/sitemap.xml")}
`;

	return textResponse(body);
};
