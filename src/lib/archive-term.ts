import { getTaxonomyTerms } from "emdash";

type Term = Awaited<ReturnType<typeof getTaxonomyTerms>>[number];

function findTerm(terms: Term[], slug: string): Term | undefined {
	for (const term of terms) {
		if (term.slug === slug) return term;
		const child = findTerm(term.children, slug);
		if (child) return child;
	}
}

export async function getArchiveTerm(taxonomy: string, slug: string | undefined) {
	if (!slug) return null;
	// Archives show the loaded page size, not an aggregate across all terms.
	return findTerm(await getTaxonomyTerms(taxonomy, { includeCounts: false }), slug) ?? null;
}
