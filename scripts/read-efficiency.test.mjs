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
    CREATE INDEX fixture_byline ON _emdash_bylines (translation_group, locale);`);
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
    for (const {sql,args} of queries) {
      const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map(r => r.detail).join('\n');
      assert.doesNotMatch(plan, /TEMP B-TREE/);
      assert.match(plan, /ptg_taxonomy_chrome|ptg_posts_public_listing/);
    }
  } finally { sqlite.close(); }
});

test('patched cleanup retains newest ten thousand including tied timestamps', async () => {
  const { t: RedirectRepository } = await import('../node_modules/emdash/dist/redirect-xZNpBoGp.mjs');
  // Run the actual compiled repository query against SQLite, including its binds.
  const { Kysely, DummyDriver, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } = await import('kysely');
  const db = new Kysely({ dialect: { createAdapter: () => new SqliteAdapter(), createDriver: () => new DummyDriver(), createIntrospector: d => new SqliteIntrospector(d), createQueryCompiler: () => new SqliteQueryCompiler() } });
  let compiled;
  const capture = db.withPlugin({ transformQuery: ({node}) => node, transformResult: async ({result}) => result });
  const repository = new RedirectRepository({ deleteFrom: (...args) => {
    const query = capture.deleteFrom(...args);
    return { where: (...where) => { const q = query.where(...where); return { async executeTakeFirst() { compiled = q.compile(); return { numDeletedRows: 0n }; } }; } };
  }, selectFrom: (...args) => capture.selectFrom(...args) });
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE _emdash_404_log (id TEXT PRIMARY KEY, last_seen_at TEXT); CREATE INDEX ptg_404_recent ON _emdash_404_log (last_seen_at DESC,id DESC)');
  const insert = sqlite.prepare('INSERT INTO _emdash_404_log VALUES (?,?)');
  for (let i = 0; i < 10005; i++) insert.run(String(i).padStart(5,'0'), '2026-10-06');
  try {
    await repository.cleanup404Log();
    assert.doesNotMatch(compiled.sql, /not in/i);
    const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${compiled.sql}`).all(...compiled.parameters).map(r => r.detail).join('\n');
    assert.doesNotMatch(plan, /TEMP B-TREE/);
    assert.match(plan, /ptg_404_recent/);
    assert.equal(sqlite.prepare(compiled.sql).run(...compiled.parameters).changes, 5);
    assert.equal(sqlite.prepare('SELECT MIN(id) AS oldest, COUNT(*) AS total FROM _emdash_404_log').get().oldest, '00005');
    assert.equal(sqlite.prepare(compiled.sql).run(...compiled.parameters).changes, 0);
  } finally { sqlite.close(); await db.destroy(); }
});
