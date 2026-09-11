import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { cachePolicy, serveCached } from '../src/lib/edge-cache.ts';
import { loadFeedEntries } from '../src/lib/feed-entries.ts';

function memoryCache() {
  const entries = new Map();
  return {
    async match(key) { return entries.get(key.url)?.clone(); },
    async put(key, response) { entries.set(key.url, response); },
  };
}
const req = (path = '/', init) => new Request(`https://practicaltravelgear.com${path}`, init);

test('repeat public reads return before CMS or database work', async () => {
  const cache = memoryCache();
  const pending = [];
  const ctx = { waitUntil: p => pending.push(p) };
  let renders = 0;
  const render = async () => { renders++; return new Response('public article', { headers: { 'content-type': 'text/html' } }); };
  const cold = await serveCached(req(), render, cache, ctx);
  assert.equal(cold.headers.get('x-edge-cache'), 'miss');
  await Promise.all(pending);
  const warm = await serveCached(req(), render, cache, ctx);
  assert.equal(await warm.text(), 'public article');
  assert.equal(warm.headers.get('x-edge-cache'), 'hit');
  assert.equal(renders, 1);
});

test('authentication, previews, APIs and writes bypass public cache', async () => {
  const requests = [
    req('/', { headers: { cookie: 'astro-session=editor' } }),
    req('/', { headers: { cookie: 'a=b; emdash-edit-mode=true' } }),
    req('/', { headers: { authorization: 'Bearer test' } }),
    req('/?_preview=test'), req('/?preview=true'), req('/_emdash/admin'),
    req('/api/private'), req('/', { method: 'POST' }), req('/', { method: 'HEAD' }),
  ];
  for (const request of requests) {
    assert.equal(cachePolicy(request), null);
    const cache = { match() { assert.fail('private cache read'); }, put() { assert.fail('private cache write'); } };
    assert.equal(await (await serveCached(request, async () => new Response('private'), cache, { waitUntil() {} })).text(), 'private');
  }
});

test('tracking variants share a cache key; search and pagination remain distinct', () => {
  assert.equal(cachePolicy(req('/?utm_source=a&gclid=123')).key.url, cachePolicy(req()).key.url);
  assert.notEqual(cachePolicy(req('/search?q=bags')).key.url, cachePolicy(req('/search?q=boots')).key.url);
  assert.notEqual(cachePolicy(req('/posts?cursor=abc')).key.url, cachePolicy(req('/posts?cursor=def')).key.url);
  for (const path of ['/llms.txt', '/sitemap-posts.xml', '/sitemap-pages.xml', '/sitemap-guides.xml', '/robots.txt']) assert.equal(cachePolicy(req(path)).maxAge, 3600);
});

test('private or variant responses and errors are never stored', async () => {
  for (const options of [
    { headers: { 'cache-control': 'private, no-store' } },
    { headers: { 'cache-control': 'no-cache' } },
    { headers: { 'cache-control': 's-maxage=0' } },
    { headers: { 'set-cookie': 'astro-session=test' } },
    { headers: { vary: 'Cookie' } }, { headers: { vary: '*' } }, { status: 500 },
  ]) {
    const cache = { async match() {}, async put() { assert.fail('non-public cache write'); } };
    await serveCached(req(), async () => new Response('body', { ...options, headers: { 'content-type': 'text/html', ...options.headers } }), cache, { waitUntil() { assert.fail('cache queued'); } });
  }
});

test('cache freshness never exceeds a shorter response policy', async () => {
  let stored;
  const cache = { async match() {}, async put(_key, response) { stored = response; } };
  const pending = [];
  await serveCached(req('/article'), async () => new Response('ok', { headers: { 'content-type': 'text/html', 'cache-control': 'public, s-maxage=60' } }), cache, { waitUntil: p => pending.push(p) });
  await Promise.all(pending);
  assert.equal(stored.headers.get('cache-control'), 'public, max-age=0, s-maxage=60');
});

function feedFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE ec_posts (id TEXT PRIMARY KEY, slug TEXT, title TEXT, excerpt TEXT, published_at TEXT, updated_at TEXT, status TEXT, deleted_at TEXT)');
  const insert = sqlite.prepare('INSERT INTO ec_posts VALUES (?, ?, ?, NULL, ?, NULL, ?, ?)');
  for (let i = 0; i < 525; i++) insert.run(String(i).padStart(4, '0'), `post-${i}`, `Title ${i}`, i < 510 ? '2026-09-01' : null, 'published', null);
  insert.run('draft', 'draft', 'Draft', null, 'draft', null);
  insert.run('deleted', 'deleted', 'Deleted', null, 'published', '2026-09-01');
  const queries = [];
  const db = { prepare(sql) { return { bind(...args) { return { async all() { queries.push({ sql, args }); return { results: sqlite.prepare(sql).all(...args) }; } }; } }; } };
  return { sqlite, db, queries };
}

test('llms feed fetches only 25 metadata rows in one query', async () => {
  const { sqlite, db, queries } = feedFixture();
  const entries = await loadFeedEntries(db, 'posts', { limit: 25 });
  assert.equal(entries.length, 25);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].args.at(-1), 25);
  assert.equal(entries[0].slug, 'post-509');
  sqlite.close();
});

test('sitemap batches retain all public posts through tied and null dates', async () => {
  const { sqlite, db, queries } = feedFixture();
  const entries = await loadFeedEntries(db, 'posts', { exclude: new Set(['post-0']) });
  assert.equal(entries.length, 524);
  assert.equal(new Set(entries.map(x => x.slug)).size, 524);
  assert.ok(entries.every(x => !['draft', 'deleted', 'post-0'].includes(x.slug)));
  assert.equal(queries.length, 3);
  assert.ok(entries.some(x => x.slug === 'post-524'));
  sqlite.close();
});

test('exclusions do not consume the requested feed limit', async () => {
  const { sqlite, db } = feedFixture();
  const entries = await loadFeedEntries(db, 'posts', { limit: 2, exclude: new Set(['post-509', 'post-508']) });
  assert.deepEqual(entries.map(x => x.slug), ['post-507', 'post-506']);
  sqlite.close();
});
