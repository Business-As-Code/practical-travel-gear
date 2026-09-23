import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

test('image sources cannot impersonate same-origin media', async () => {
  const { resolveMedia, keyFromSrc } = await import('../src/lib/responsive-image.ts');
  for (const src of ['https://evil.example/images/bag.png', 'https://evil.example/_emdash/api/media/file/bag.png', '//evil.example/images/bag.png']) {
    assert.equal(resolveMedia(src), null);
    assert.equal(keyFromSrc(src), undefined);
  }
});

test('restored public routes keep authors, RSS subscription and real 404 responses', async () => {
  for (const path of ['src/pages/authors/index.astro', 'src/pages/authors/[slug].astro', 'src/pages/subscribe.astro', 'src/pages/feed.ts', 'src/pages/rss.ts', 'src/pages/ads.txt.ts', 'src/lib/not-found.ts', 'src/lib/wp-legacy.ts']) {
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} must survive reconciliation`);
  }
  const { rewriteNotFound } = await import('../src/lib/not-found.ts');
  const response = rewriteNotFound();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('location'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.doesNotMatch(source('src/layouts/Base.astro'), /onsubmit="event.preventDefault\(\);"/);
});

test('reconciled wiring retains native scheduling and cache without an unprovisioned KV', () => {
  assert.match(source('src/worker.ts'), /createScheduledHandler/);
  assert.match(source('src/worker.ts'), /handleImg/);
  assert.doesNotMatch(source('src/worker.ts'), /publishDueScheduledContent|prewarmPublicPages|matchPublicHtml/);
  assert.doesNotMatch(source('astro.config.mjs'), /kvCache|binding: "CACHE"/);
  assert.match(source('src/middleware.ts'), /legacyRedirect/);
  for (const path of ['src/pages/index.astro','src/pages/posts/index.astro','src/pages/category/[slug].astro','src/pages/tag/[slug].astro','src/pages/authors/index.astro','src/pages/authors/[slug].astro']) assert.match(source(path), /Astro.cache.set/);
  for (const path of ['src/pages/category/[slug].astro','src/pages/tag/[slug].astro']) assert.match(source(path), /hasMore/);
  for (const path of ['src/pages/posts/[slug].astro','src/pages/pages/[slug].astro','src/pages/guides/[slug].astro']) assert.doesNotMatch(source(path), /Astro.redirect\("\/404"\)/);
});

test('article heroes preserve responsive priority and the existing optional scene', () => {
  assert.match(source('src/pages/posts/[slug].astro'), /ResponsiveImage.*hero priority/);
  assert.match(source('src/pages/guides/[slug].astro'), /ResponsiveImage.*hero priority/);
  assert.match(source('src/pages/posts/[slug].astro'), /data-hero-scene/);
  assert.match(source('public/hero-scenes/hiking-hydration.js'), /prefers-reduced-motion/);
});

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('responsive media preserves R2 object keys and bounded srcsets', async () => {
  assert.ok(existsSync(new URL('../src/lib/responsive-image.ts', import.meta.url)), 'responsive media helper must be restored');
  const { resolveMedia, transformSrc, srcsetFor, isSafeImagePath } = await import('../src/lib/responsive-image.ts');
  const image = resolveMedia({ src: '/_emdash/api/media/file/bag.png', alt: 'Bag', meta: { storageKey: 'bag.png' } });
  assert.equal(image.alt, 'Bag');
  assert.equal(transformSrc(image.src, 640), '/img?k=bag.png&w=640&f=webp');
  assert.match(srcsetFor(image.src, [640, 960]), /640w, .*960w$/);
  assert.equal(isSafeImagePath('/_emdash/api/media/file/../private'), false);
});
