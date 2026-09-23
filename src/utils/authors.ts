import { getBylineBySlug } from "emdash";
import { getBylineAvatar } from "./gravatar";

/** Bylines we know exist in the CMS. Featured first. */
export const BYLINE_SLUGS = [
	"dana-rebmann",
	"jill",
	"chris-guill",
	"leah",
	"tim-leffel",
	"amy",
	"ramsey",
	"kara",
	"pam",
	"tim-guill",
	"ahmed",
	"johng",
	"trevor-main",
	"jeff-tobias",
	"tristan-drollinger",
	"eunil-gadiana",
	"christian-parrott",
	"james-alanano",
	"britney-smith",
] as const;

export const FEATURED_SLUGS = new Set([
	"dana-rebmann",
	"jill",
	"chris-guill",
	"leah",
]);

export type AuthorCard = {
	slug: string;
	name: string;
	bio: string | null;
	avatar: string;
	websiteUrl: string | null;
	featured: boolean;
};

export async function loadAuthor(slug: string): Promise<AuthorCard | null> {
	const byline = await getBylineBySlug(slug);
	if (!byline) return null;
	return {
		slug: byline.slug,
		name: byline.displayName,
		bio: byline.bio,
		avatar: byline.avatarStorageKey
			? `/_emdash/api/media/file/${byline.avatarStorageKey}`
			: getBylineAvatar(byline.slug),
		websiteUrl: byline.websiteUrl,
		featured: FEATURED_SLUGS.has(byline.slug),
	};
}

export async function loadAuthors(): Promise<AuthorCard[]> {
	const rows = await Promise.all(BYLINE_SLUGS.map((slug) => loadAuthor(slug)));
	return rows.filter((row): row is AuthorCard => row !== null);
}
