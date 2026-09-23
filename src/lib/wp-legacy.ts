/**
 * Prefix rules for leftover WordPress URLs.
 * Exact-path 301s live in wp-redirects.ts.
 */
import { BYLINE_SLUGS } from "../utils/authors";

const AUTHOR_ALIASES: Record<string, string> = {
	"jill-robinson": "jill",
	"leah-guill": "leah",
	leahguill: "leah",
	chris: "chris-guill",
	dana: "dana-rebmann",
};

const knownAuthors = new Set<string>([...BYLINE_SLUGS, ...Object.values(AUTHOR_ALIASES)]);

function stripSlash(pathname: string): string {
	return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function legacyRedirect(pathname: string): string | null {
	const path = stripSlash(pathname);

	if (/^\/page\/\d+$/.test(path)) return "/posts";
	if (path === "/feed" || path.startsWith("/feed/")) return "/rss.xml";
	if (path === "/tag" || path === "/tags") return "/";
	if (path === "/features") return "/posts";
	if (path === "/advertise") return "/advertise-on-practical-travel-gear";
	if (path === "/mediakit") return "/media-kit";

	const author = path.match(/^\/author\/([^/]+)$/);
	if (author) {
		const mapped = AUTHOR_ALIASES[author[1]] ?? author[1];
		return knownAuthors.has(mapped) ? `/authors/${mapped}` : "/authors";
	}

	const authorsAlias = path.match(/^\/authors\/([^/]+)$/);
	if (authorsAlias) {
		const mapped = AUTHOR_ALIASES[authorsAlias[1]];
		if (mapped && mapped !== authorsAlias[1]) return `/authors/${mapped}`;
	}

	return null;
}
