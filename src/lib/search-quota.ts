export type QuotaSql = { exec<T extends Record<string, unknown>>(query: string, ...bindings: (string | number)[]): Iterable<T> };

export function initializeQuota(sql: QuotaSql) {
	sql.exec(`CREATE TABLE IF NOT EXISTS searches (
		client TEXT PRIMARY KEY, burst_start INTEGER, burst_count INTEGER,
		minute_start INTEGER, minute_count INTEGER)`);
	sql.exec('CREATE INDEX IF NOT EXISTS searches_expiry ON searches (minute_start)');
}

/** Each call is synchronous inside one Durable Object: requests cannot race
 * between checking and incrementing. Fixed windows allow a boundary burst. */
export function checkQuota(sql: QuotaSql, client: string, now: number) {
	const burstStart = Math.floor(now / 10000) * 10000;
	const minuteStart = Math.floor(now / 60000) * 60000;
	const row = [...sql.exec<{ burst_start: number; burst_count: number; minute_start: number; minute_count: number }>(
		'SELECT burst_start, burst_count, minute_start, minute_count FROM searches WHERE client = ?', client)][0];
	const burst = row?.burst_start === burstStart ? row.burst_count : 0;
	const minute = row?.minute_start === minuteStart ? row.minute_count : 0;
	if (burst >= 20 || minute >= 60) return { success: false };
	sql.exec(`INSERT INTO searches VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(client) DO UPDATE SET burst_start=excluded.burst_start,
		burst_count=excluded.burst_count, minute_start=excluded.minute_start, minute_count=excluded.minute_count`,
		client, burstStart, burst + 1, minuteStart, minute + 1);
	return { success: true };
}
