import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('slim listing queries omit bodies, hide drafts, order ties, filter terms and paginate', async () => {
  assert.ok(existsSync(new URL('../src/lib/listing-query.ts', import.meta.url)), 'slim query implementation must be restored');
  const { queryCards } = await import('../src/lib/listing-query.ts');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE ec_posts (id TEXT, slug TEXT, title TEXT, excerpt TEXT, featured_image TEXT, published_at TEXT, primary_byline_id TEXT, status TEXT, deleted_at TEXT);
    CREATE TABLE _emdash_bylines (translation_group TEXT, locale TEXT, display_name TEXT);
    CREATE TABLE content_taxonomies (collection TEXT, entry_id TEXT, taxonomy_id TEXT);
    CREATE TABLE taxonomies (id TEXT, name TEXT, slug TEXT);
    INSERT INTO _emdash_bylines VALUES ('writer','en','Writer');
    INSERT INTO taxonomies VALUES ('term','tag','bags');
    INSERT INTO content_taxonomies VALUES ('posts','02','term');`);
  const insert = sqlite.prepare('INSERT INTO ec_posts VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)');
  for (const [id,status,deleted] of [['01','published',null],['02','published',null],['03','draft',null],['04','published','2026-01-01']]) {
    insert.run(id, `post-${id}`, `Title ${id}`, JSON.stringify({id:'media-record-id',src:'/_emdash/api/media/file/bag.png',alt:'Bag'}), '2026-09-01', 'writer', status, deleted);
  }
  const queries = [];
  const db = { prepare(sql) { return { bind(...args) { return { async all() { queries.push(sql); return {results:sqlite.prepare(sql).all(...args)}; } }; } }; } };
  try {
    const first = await queryCards(db, 'posts', {limit:1});
    assert.equal(first.hasMore, true);
    assert.equal(first.cards[0].slug, 'post-02');
    assert.equal(first.cards[0].featuredImage.src, '/_emdash/api/media/file/bag.png');
    assert.equal(first.cards[0].authorName, 'Writer');
    const second = await queryCards(db, 'posts', {limit:1, offset:1});
    assert.equal(second.hasMore, false);
    assert.equal(second.cards[0].slug, 'post-01');
    const tagged = await queryCards(db, 'posts', {term:{name:'tag',slug:'bags'}});
    assert.deepEqual(tagged.cards.map(p=>p.slug), ['post-02']);
    assert.ok(queries.every(sql=>!sql.includes('p.content') && !sql.includes('SELECT *')));
  } finally { sqlite.close(); }
});
