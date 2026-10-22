import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { queryChromeTags } from '../src/lib/chrome-tags-query.ts';
import { queryCards } from '../src/lib/listing-query.ts';

test('ten visible tags and published listings use indexes without temporary sorting', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE taxonomies (name TEXT, sort_order INTEGER, label TEXT, slug TEXT);
    CREATE TABLE _emdash_404_log (id TEXT PRIMARY KEY, last_seen_at TEXT);
    CREATE TABLE ec_posts (id TEXT PRIMARY KEY, published_at TEXT, status TEXT, deleted_at TEXT, slug TEXT, title TEXT, excerpt TEXT, featured_image TEXT, primary_byline_id TEXT);
    CREATE TABLE ec_guides (id TEXT, published_at TEXT, status TEXT, deleted_at TEXT);
    CREATE TABLE _emdash_bylines (translation_group TEXT, locale TEXT, display_name TEXT);
    CREATE INDEX fixture_byline ON _emdash_bylines (translation_group, locale);
    CREATE TABLE _emdash_content_bylines (collection_slug TEXT NOT NULL, content_id TEXT NOT NULL, byline_id TEXT NOT NULL, UNIQUE (collection_slug, content_id, byline_id));`);
  sqlite.exec(readFileSync(new URL('../migrations/site/2026-10-06-read-indexes.sql', import.meta.url), 'utf8'));
  const term = sqlite.prepare('INSERT INTO taxonomies VALUES (?,0,?,?)');
  for (let i = 0; i < 3000; i++) term.run('tag', `Tag ${String(i).padStart(4, '0')}`, `tag-${i}`);
  const queries = [];
  const db = { prepare(sql) { return {
    async all() { queries.push({sql,args:[]}); return { results: sqlite.prepare(sql).all() }; },
    bind(...args) { return { async all() { queries.push({sql,args}); return { results: sqlite.prepare(sql).all(...args) }; } }; },
  }; } };
  try {
    const tags = await queryChromeTags(db);
    assert.equal(tags.length, 10);
    assert.equal(tags[0].slug, 'tag-0');
    await queryCards(db, 'posts', { limit: 21 });
    await queryCards(db, 'posts', { limit: 21, after: { publishedAt: '2024-01-01T00:00:00.000Z', id: '01ZZZZZZZZZZZZZZZZZZZZZZZZ' } });
    await queryCards(db, 'posts', { limit: 12, bylineId: 'shared-credit-group' });
    const listings = queries.filter(({sql}) => sql.includes('FROM ec_posts'));
    assert.equal(listings.length, 3);
    const byline = listings.find(({sql}) => sql.includes('_emdash_content_bylines'));
    assert.ok(byline);
    assert.match(byline.sql, /exists/i);
    assert.doesNotMatch(byline.sql, /join _emdash_content_bylines/i);
    for (const listing of listings) {
      assert.doesNotMatch(listing.sql, /\boffset\b/i);
    }
    // A 21-card page fetches 22 rows (one extra for hasMore). The author page fetches 13.
    assert.equal(listings.filter((listing) => listing.args.at(-1) === 22).length, 2);
    assert.equal(byline.args.at(-1), 13);
    for (const {sql,args} of queries) {
      const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map(r => r.detail).join('\n');
      assert.doesNotMatch(plan, /TEMP B-TREE/);
      assert.match(plan, /ptg_taxonomy_chrome|ptg_posts_public_listing/);
    }
  } finally { sqlite.close(); }
});

function open404Log(rowCount) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE _emdash_404_log (
    id TEXT PRIMARY KEY,
    path TEXT,
    last_seen_at TEXT
  );
  CREATE INDEX ptg_404_recent ON _emdash_404_log (last_seen_at DESC, id DESC);`);
  sqlite.exec(readFileSync(new URL('../migrations/site/2026-10-22-404-cardinality.sql', import.meta.url), 'utf8'));
  const insert = sqlite.prepare('INSERT INTO _emdash_404_log (id, path, last_seen_at) VALUES (?, ?, ?)');
  sqlite.exec('BEGIN');
  for (let i = 0; i < rowCount; i++) {
    const id = String(i).padStart(5, '0');
    insert.run(id, `/missing-${id}`, '2026-10-22T00:00:00.000Z');
  }
  sqlite.exec('COMMIT');
  return sqlite;
}

async function cleanupOn(sqlite) {
  const { t: RedirectRepository } = await import('../node_modules/emdash/dist/redirect-DcmNMvOs.mjs');
  const { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } = await import('kysely');
  const queries = [];
  const connection = {
    async executeQuery(compiled) {
      const parameters = compiled.parameters.map((value) => typeof value === 'bigint' ? Number(value) : value);
      queries.push({ sql: compiled.sql, parameters });
      const stmt = sqlite.prepare(compiled.sql);
      const text = compiled.sql.trim().toLowerCase();
      if (text.startsWith('select') || text.startsWith('with') || text.startsWith('explain')) {
        return { rows: stmt.all(...parameters) };
      }
      const result = stmt.run(...parameters);
      return { rows: [], numAffectedRows: BigInt(result.changes) };
    },
  };
  const db = new Kysely({ dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => ({
      async init() {},
      async acquireConnection() { return connection; },
      async releaseConnection() {},
      async destroy() {},
      async beginTransaction() { sqlite.exec('BEGIN'); },
      async commitTransaction() { sqlite.exec('COMMIT'); },
      async rollbackTransaction() { sqlite.exec('ROLLBACK'); },
    }),
    createIntrospector: (dialect) => new SqliteIntrospector(dialect),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  } });
  try {
    const deleted = await new RedirectRepository(db).cleanup404Log();
    return { deleted, queries };
  } finally {
    await db.destroy();
  }
}

test('404 cleanup trims a small oldest batch only when the counter exceeds 10000', async () => {
  const over = open404Log(10005);
  try {
    assert.equal(over.prepare('SELECT row_count AS n FROM ptg_404_cardinality').get().n, 10005);
    const { deleted, queries } = await cleanupOn(over);
    assert.equal(deleted, 5);
    assert.equal(queries.length, 2);
    assert.match(queries[0].sql, /ptg_404_cardinality/i);
    assert.doesNotMatch(queries[0].sql, /_emdash_404_log/i);
    assert.deepEqual(queries[0].parameters, [1]);
    assert.doesNotMatch(queries[1].sql, /not in/i);
    assert.equal(queries[1].parameters.at(-1), 5);
    assert.ok(!queries[1].parameters.some((value) => Number(value) === 2147483647));
    const plan = over.prepare(`EXPLAIN QUERY PLAN ${queries[1].sql}`).all(...queries[1].parameters).map((row) => row.detail).join('\n');
    assert.doesNotMatch(plan, /TEMP B-TREE/);
    assert.match(plan, /ptg_404_recent/);
    const left = over.prepare('SELECT MIN(id) AS oldest, COUNT(*) AS total FROM _emdash_404_log').get();
    assert.equal(left.total, 10000);
    assert.equal(left.oldest, '00005');
    assert.equal(over.prepare('SELECT row_count AS n FROM ptg_404_cardinality').get().n, 10000);
  } finally { over.close(); }

  const backlog = open404Log(10150);
  try {
    const { deleted, queries } = await cleanupOn(backlog);
    assert.equal(deleted, 100);
    assert.equal(queries[1].parameters.at(-1), 100);
    assert.equal(backlog.prepare('SELECT COUNT(*) AS n FROM _emdash_404_log').get().n, 10050);
    assert.equal(backlog.prepare('SELECT MIN(id) AS oldest FROM _emdash_404_log').get().oldest, '00100');
  } finally { backlog.close(); }

  const under = open404Log(9999);
  try {
    const { deleted, queries } = await cleanupOn(under);
    assert.equal(deleted, 0);
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /ptg_404_cardinality/i);
    assert.doesNotMatch(queries[0].sql, /_emdash_404_log/i);
    assert.equal(under.prepare('SELECT COUNT(*) AS n FROM _emdash_404_log').get().n, 9999);
    const plan = under.prepare(`EXPLAIN QUERY PLAN ${queries[0].sql}`).all(...queries[0].parameters).map((row) => row.detail).join('\n');
    assert.match(plan, /ptg_404_cardinality/);
    assert.doesNotMatch(plan, /_emdash_404_log|SCAN/);
  } finally { under.close(); }
});
