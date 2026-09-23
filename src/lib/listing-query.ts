/**
 * Listing cards from D1 without loading Portable Text bodies.
 *
 * EmDash's getEmDashCollection always hydrates the full `data` row
 * (including `content`). Homepage / archives only need slug, title,
 * excerpt, image, date, author.
 */
type ListingDb = { prepare(sql: string): { bind(...values: (string | number | null)[]): { all<T>(): Promise<{ results: T[] }> } } };

const TABLES = {
	posts: "ec_posts",
	guides: "ec_guides",
} as const;

export type ListingCollection = keyof typeof TABLES;

export type ListingCard = {
	slug: string;
	href: string;
	title: string;
	excerpt: string | null;
	featuredImage: unknown;
	publishedAt: Date | null;
	authorName: string | null;
};

export type ListCardsOpts = {
	limit?: number;
	offset?: number;
	/** Taxonomy filter. `name` is "category" or "tag". */
	term?: { name: "category" | "tag"; slug: string };
};

type CardRow = {
	slug: string | null;
	title: string | null;
	excerpt: string | null;
	featured_image: string | null;
	published_at: string | null;
	author_name: string | null;
};

function hrefFor(collection: ListingCollection, slug: string): string {
	return collection === "guides" ? `/guides/${slug}` : `/${slug}`;
}

function parseImage(raw: string | null): unknown {
	if (!raw) return undefined;
	let value: unknown = raw;
	if (raw.startsWith("{") || raw.startsWith("[")) {
		try {
			value = JSON.parse(raw);
		} catch {
			return undefined;
		}
	}
	if (!value || typeof value !== "object") return undefined;
	const obj = value as Record<string, unknown>;
	const media = obj.$media;
	if (media && typeof media === "object") {
		const m = media as Record<string, unknown>;
		const url = typeof m.url === "string" ? m.url : typeof m.src === "string" ? m.src : null;
		if (url) return { src: url, alt: typeof m.alt === "string" ? m.alt : "" };
	}
	const meta = obj.meta && typeof obj.meta === "object" ? (obj.meta as Record<string, unknown>) : {};
	const storageKey =
		(typeof meta.storageKey === "string" && meta.storageKey) ||
		(typeof obj.id === "string" && obj.id) ||
		null;
	const alt =
		(typeof obj.alt === "string" && obj.alt) ||
		(typeof meta.alt === "string" && meta.alt) ||
		"";
	if (typeof obj.src === "string" && obj.src) {
		return { ...obj, alt };
	}
	if (storageKey) {
		return {
			...obj,
			src: `/_emdash/api/media/file/${storageKey}`,
			alt,
		};
	}
	return obj;
}

function rowToCard(collection: ListingCollection, row: CardRow): ListingCard | null {
	const slug = (row.slug || "").trim();
	if (!slug) return null;
	const publishedAt = row.published_at ? new Date(row.published_at) : null;
	return {
		slug,
		href: hrefFor(collection, slug),
		title: (row.title || "").trim() || "Untitled",
		excerpt: row.excerpt?.trim() || null,
		featuredImage: parseImage(row.featured_image),
		publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
		authorName: row.author_name?.trim() || null,
	};
}

export async function queryCards(
	db: ListingDb,
	collection: ListingCollection,
	opts: ListCardsOpts,
): Promise<{ cards: ListingCard[]; hasMore: boolean }> {
	const table = TABLES[collection];
	const limit = Math.max(1, Math.min(opts.limit ?? 24, 48));
	const offset = Math.max(0, opts.offset ?? 0);
	const fetchLimit = limit + 1;

	const binds: (string | number | null)[] = [];
	let sql = `
		SELECT
			p.slug AS slug,
			p.title AS title,
			p.excerpt AS excerpt,
			p.featured_image AS featured_image,
			p.published_at AS published_at,
			b.display_name AS author_name
		FROM ${table} p
		LEFT JOIN _emdash_bylines b
			ON b.translation_group = p.primary_byline_id
			AND (b.locale = 'en' OR b.locale IS NULL)
	`;

	if (opts.term) {
		sql += `
		INNER JOIN content_taxonomies ct
			ON ct.collection = ? AND ct.entry_id = p.id
		INNER JOIN taxonomies t
			ON t.id = ct.taxonomy_id
		`;
		binds.push(collection);
	}

	sql += `
		WHERE p.status = 'published'
			AND (p.deleted_at IS NULL OR p.deleted_at = '')
	`;

	if (opts.term) {
		sql += ` AND t.name = ? AND t.slug = ? `;
		binds.push(opts.term.name, opts.term.slug);
	}

	sql += `
		ORDER BY p.published_at DESC, p.id DESC
		LIMIT ? OFFSET ?
	`;
	binds.push(fetchLimit, offset);

	const result = await db.prepare(sql)
		.bind(...binds)
		.all<CardRow>();
	const rows = result.results ?? [];
	const hasMore = rows.length > limit;
	const cards = rows
		.slice(0, limit)
		.map((row) => rowToCard(collection, row))
		.filter((c): c is ListingCard => c !== null);
	return { cards, hasMore };
}
