import { getTerm } from "emdash";

export async function getArchiveTerm(taxonomy: string, slug: string | undefined) {
	if (!slug) return null;
	// Archives show the loaded page size, not an aggregate across all terms.
	return getTerm(taxonomy, slug, { includeCounts: false });
}
