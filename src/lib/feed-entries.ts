const TABLES = { posts: "ec_posts", guides: "ec_guides", pages: "ec_pages" } as const;
type Collection = keyof typeof TABLES;
type FeedRow = {
	id: string;
	slug: string;
	title: string | null;
	excerpt: string | null;
	published_at: string | null;
	updated_at: string | null;
};
type FeedDb = {
	prepare(sql: string): { bind(...values: (string | number | null)[]): { all<T>(): Promise<{ results: T[] }> } };
};

export async function loadFeedEntries(
	db: FeedDb,
	collection: Collection,
	opts: { exclude?: Set<string>; limit?: number } = {},
) {
	const entries: Array<{ slug: string; title: string; excerpt: string | null; publishedAt: string | null; updatedAt: string | null }> = [];
	let cursor: FeedRow | undefined;
	while (opts.limit === undefined || entries.length < opts.limit) {
		const size = Math.min(200, opts.limit === undefined ? 200 : opts.limit - entries.length);
		const values: (string | number | null)[] = [];
		let after = "";
		if (cursor) {
			if (cursor.published_at === null) {
				after = "AND published_at IS NULL AND id < ?";
				values.push(cursor.id);
			} else {
				after = "AND (published_at < ? OR (published_at = ? AND id < ?) OR published_at IS NULL)";
				values.push(cursor.published_at, cursor.published_at, cursor.id);
			}
		}
		values.push(size);
		// Feeds need metadata only, not article bodies, images, bylines or tags.
		const { results } = await db.prepare(`
			SELECT id, slug, title, excerpt, published_at, updated_at
			FROM ${TABLES[collection]}
			WHERE status = 'published' AND deleted_at IS NULL ${after}
			ORDER BY published_at DESC, id DESC LIMIT ?
		`).bind(...values).all<FeedRow>();
		for (const row of results) {
			if (!row.slug || opts.exclude?.has(row.slug)) continue;
			entries.push({ slug: row.slug, title: row.title || row.slug, excerpt: row.excerpt,
				publishedAt: row.published_at, updatedAt: row.updated_at });
		}
		if (results.length < size) break;
		cursor = results.at(-1);
	}
	return entries;
}
