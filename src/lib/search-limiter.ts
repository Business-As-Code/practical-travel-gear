import { checkQuota, initializeQuota, type QuotaSql } from './search-quota';

/** One private object holds short-lived counters, not CMS content or D1 data. */
export class PublicSearchLimiter {
	private sql: QuotaSql;
	private cleanedAt = 0;
	constructor(ctx: { storage: { sql: QuotaSql } }) {
		this.sql = ctx.storage.sql;
		initializeQuota(this.sql);
	}
	async fetch(request: Request): Promise<Response> {
		const { key } = await request.json() as { key?: unknown };
		if (typeof key !== 'string' || key.length > 256) return new Response(null, { status: 400 });
		const now = Date.now();
		if (now - this.cleanedAt >= 60000) {
			this.sql.exec('DELETE FROM searches WHERE minute_start < ?', Math.floor(now / 60000) * 60000);
			this.cleanedAt = now;
		}
		return Response.json(checkQuota(this.sql, key, now));
	}
}
