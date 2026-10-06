type Db = { prepare(sql: string): { all<T>(): Promise<{ results: T[] }> } };

export async function queryChromeTags(db: Db): Promise<Array<{ slug: string; label: string }>> {
	const { results } = await db.prepare(`SELECT slug, label FROM taxonomies
		WHERE name = 'tag' ORDER BY sort_order, label LIMIT 10`).all<{ slug: string; label: string }>();
	return results;
}
