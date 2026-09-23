import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { cachePolicy, applyCachePolicy, invalidateMediaWrite } from '../src/lib/edge-cache.ts';
import { loadFeedEntries } from '../src/lib/feed-entries.ts';

const req = (path = '/', init) => new Request(`https://practicaltravelgear.com${path}`, init);
const html = (headers = {}, status = 200) => new Response('body', { status, headers: { 'content-type': 'text/html', ...headers } });

test('native public variants separate Cookie and Authorization before Worker dispatch', () => {
  const result = applyCachePolicy(req('/'), html());
  const vary = (result.headers.get('vary') ?? '').toLowerCase().split(',').map(s => s.trim());
  assert.ok(vary.includes('cookie'));
  assert.ok(vary.includes('authorization'));
});

test('public responses use native cache with CMS invalidation tags', () => {
  const result = applyCachePolicy(req('/article'), html({ 'cache-tag': 'article-id,astro-version:123' }));
  assert.equal(result.headers.get('cloudflare-cdn-cache-control'), 'public, max-age=3600');
  assert.equal(result.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  for (const tag of ['article-id', 'astro-version:123', 'posts', 'emdash:settings', 'emdash:taxonomy:tag', 'emdash:widget-area:footer']) assert.ok(result.headers.get('cache-tag').split(',').includes(tag));
  assert.equal(applyCachePolicy(req('/'), html()).headers.get('cloudflare-cdn-cache-control'), 'public, max-age=300');
});

test('private requests, unclassified routes, errors and variant responses opt out of heuristic caching', () => {
  for (const request of [req('/', { headers: { cookie: 'astro-session=editor' } }), req('/', { headers: { cookie: 'a=b; emdash-edit-mode=true' } }), req('/', { headers: { authorization: 'Bearer test' } }), req('/?_preview=test'), req('/?preview=true'), req('/_emdash/admin'), req('/api/private'), req('/', { method: 'POST' }), req('/unknown/deep/route')]) {
    assert.equal(cachePolicy(request), null);
    assert.equal(applyCachePolicy(request, html()).headers.get('cloudflare-cdn-cache-control'), 'no-store');
  }
  for (const headers of [{ 'cache-control': 'private, no-store' }, { 'cache-control': 'no-cache' }, { 'cache-control': 's-maxage=0' }, { 'set-cookie': 'astro-session=test' }, { vary: 'Cookie' }, { vary: '*' }]) assert.equal(applyCachePolicy(req(), html(headers)).headers.get('cloudflare-cdn-cache-control'), 'no-store');
  assert.equal(applyCachePolicy(req(), html({}, 500)).headers.get('cloudflare-cdn-cache-control'), 'no-store');
});

test('shorter native or origin freshness policies are retained', () => {
  for (const headers of [{ 'cache-control': 'public, s-maxage=60' }, { 'cloudflare-cdn-cache-control': 'public, max-age=60' }]) assert.equal(applyCachePolicy(req('/article'), html(headers)).headers.get('cloudflare-cdn-cache-control'), 'public, max-age=60');
});

test('feeds receive invalidation tags and public media keeps its explicit policy', () => {
  for (const path of ['/llms.txt', '/sitemap-posts.xml', '/sitemap-pages.xml', '/sitemap-guides.xml', '/robots.txt']) assert.equal(cachePolicy(req(path)).maxAge, 3600);
  const media = applyCachePolicy(req('/_image'), new Response('image', { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } }));
  assert.equal(media.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.match(media.headers.get('vary') ?? '', /Cookie/);
  assert.match(media.headers.get('vary') ?? '', /Authorization/);
});

test('page sitemaps work with the core pages schema without excerpt', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE ec_pages (id TEXT, slug TEXT, title TEXT, published_at TEXT, updated_at TEXT, status TEXT, deleted_at TEXT); INSERT INTO ec_pages VALUES ('1','about','About',NULL,NULL,'published',NULL)");
  const db = { prepare(sql) { return { bind(...args) { return { async all() { return { results: sqlite.prepare(sql).all(...args) }; } }; } }; } };
  try {
    const entries = await loadFeedEntries(db, 'pages');
    assert.equal(entries[0].slug, 'about');
    assert.equal(entries[0].excerpt, null);
  } finally { sqlite.close(); }
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


test('successful media mutations purge images and referring pages; failed writes do not', async () => {
  const calls = [];
  const purge = async options => { calls.push(options); return { success: true }; };
  await invalidateMediaWrite(req('/_emdash/api/media/123/replace', { method: 'POST' }), new Response('{}'), purge);
  assert.ok(calls[0].tags.includes('media') && calls[0].tags.includes('posts'));
  await invalidateMediaWrite(req('/_emdash/api/media/123/replace', { method: 'POST' }), new Response('{}', { status: 403 }), purge);
  await invalidateMediaWrite(req('/_emdash/api/media/123'), new Response('{}'), purge);
  assert.equal(calls.length, 1);
});


test('Astro browser revalidation does not cancel explicit CDN freshness', () => {
  const headers = { 'cache-control': 'no-cache', 'cloudflare-cdn-cache-control': 'public, max-age=300' };
  assert.equal(applyCachePolicy(req(), html(headers)).headers.get('cloudflare-cdn-cache-control'), 'public, max-age=300');
  assert.equal(applyCachePolicy(req(), html({ ...headers, 'cache-control': 'private, no-store' })).headers.get('cloudflare-cdn-cache-control'), 'no-store');
});
