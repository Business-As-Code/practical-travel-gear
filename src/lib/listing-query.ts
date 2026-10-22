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
	id: string;
	slug: string;
	href: string;
	title: string;
	excerpt: string | null;
	featuredImage: unknown;
	publishedAt: Date | null;
	/** Stored `published_at` text. Keyset cursors compare this, not a reformatted Date. */
	publishedAtRaw: string | null;
	authorName: string | null;
};

/** Keyset position. `publishedAt` is the raw column value; `id` is the entry ULID. */
export type ListingCursor = { publishedAt: string; id: string };

export type ListCardsOpts = {
	limit?: number;
	offset?: number;
	/** Continue after this card. Avoids OFFSET scans on later pages. */
	after?: ListingCursor;
	/** Taxonomy filter. `name` is "category" or "tag". */
	term?: { name: "category" | "tag"; slug: string };
	/** Byline translation group stored on `_emdash_content_bylines.byline_id`. */
	bylineId?: string;
	/** Hydrate only these entry ids. Results keep this order. */
	ids?: string[];
};

type CardRow = {
	id: string | null;
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
	const id = (row.id || "").trim();
	if (!slug || !id) return null;
	const publishedAtRaw = row.published_at?.trim() || null;
	const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : null;
	return {
		id,
		slug,
		href: hrefFor(collection, slug),
		title: (row.title || "").trim() || "Untitled",
		excerpt: row.excerpt?.trim() || null,
		featuredImage: parseImage(row.featured_image),
		publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
		publishedAtRaw,
		authorName: row.author_name?.trim() || null,
	};
}

const AFTER_SEPARATOR = "~";

export function parseListingAfter(value: string | null | undefined): ListingCursor | undefined {
	if (!value) return undefined;
	const split = value.lastIndexOf(AFTER_SEPARATOR);
	if (split <= 0) return undefined;
	const publishedAt = value.slice(0, split);
	const id = value.slice(split + 1);
	if (!publishedAt || !id || publishedAt.length > 40 || id.length > 80) return undefined;
	if (/[\u0000-\u001f]/.test(publishedAt) || /[\u0000-\u001f]/.test(id)) return undefined;
	return { publishedAt, id };
}

export function nextListingHref(path: string, cards: ListingCard[], hasMore: boolean): string | null {
	const last = cards[cards.length - 1];
	if (!hasMore || !last?.publishedAtRaw || !last.id) return null;
	const url = new URL(path, "https://practicaltravelgear.com");
	url.searchParams.set("after", `${last.publishedAtRaw}${AFTER_SEPARATOR}${last.id}`);
	return `${url.pathname}${url.search}`;
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
	const ids = (opts.ids ?? []).filter((id) => id).slice(0, 48);
	if (opts.ids && ids.length === 0) return { cards: [], hasMore: false };

	const binds: (string | number | null)[] = [];
	// A byline filter has to stay on the public listing index. Joining
	// `_emdash_content_bylines` makes SQLite sort every credit for that
	// author (thousands of rows) before LIMIT. EXISTS lets the index walk
	// stop once the page is full. The author name is a scalar lookup on the
	// rows that walk actually visits; a LEFT JOIN next to EXISTS drops the
	// partial index.
	const authorSelect = opts.bylineId
		? `(SELECT b.display_name FROM _emdash_bylines b
			WHERE b.translation_group = p.primary_byline_id
				AND (b.locale = 'en' OR b.locale IS NULL)
			LIMIT 1) AS author_name`
		: `b.display_name AS author_name`;
	let sql = `
		SELECT
			p.id AS id,
			p.slug AS slug,
			p.title AS title,
			p.excerpt AS excerpt,
			p.featured_image AS featured_image,
			p.published_at AS published_at,
			${authorSelect}
		FROM ${table} p
	`;

	if (!opts.bylineId) {
		sql += `
		LEFT JOIN _emdash_bylines b
			ON b.translation_group = p.primary_byline_id
			AND (b.locale = 'en' OR b.locale IS NULL)
		`;
	}

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

	if (opts.bylineId) {
		sql += `
			AND EXISTS (
				SELECT 1 FROM _emdash_content_bylines cb
				WHERE cb.collection_slug = ?
					AND cb.content_id = p.id
					AND cb.byline_id = ?
			)
		`;
		binds.push(collection, opts.bylineId);
	}

	if (ids.length > 0) {
		sql += ` AND p.id IN (${ids.map(() => "?").join(",")}) `;
		binds.push(...ids);
	}

	// Keyset pages seek the partial listing index. OFFSET would walk every
	// skipped row, which is what made a later 21-card page read hundreds.
	const keyset = !ids.length && opts.after?.publishedAt && opts.after.id ? opts.after : undefined;
	if (keyset) {
		sql += ` AND (p.published_at < ? OR (p.published_at = ? AND p.id < ?)) `;
		binds.push(keyset.publishedAt, keyset.publishedAt, keyset.id);
	}

	if (ids.length > 0) {
		sql += ` LIMIT ? `;
		binds.push(fetchLimit);
	} else {
		sql += `
			ORDER BY p.published_at DESC, p.id DESC
			LIMIT ?
		`;
		binds.push(fetchLimit);
		if (!keyset && offset > 0) {
			sql += ` OFFSET ? `;
			binds.push(offset);
		}
	}

	const result = await db.prepare(sql)
		.bind(...binds)
		.all<CardRow>();
	const rows = result.results ?? [];
	const hasMore = ids.length > 0 ? false : rows.length > limit;
	let cards = rows
		.slice(0, limit)
		.map((row) => rowToCard(collection, row))
		.filter((c): c is ListingCard => c !== null);
	if (ids.length > 0) {
		const order = new Map(ids.map((id, index) => [id, index]));
		cards = cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
	}
	return { cards, hasMore };
}
