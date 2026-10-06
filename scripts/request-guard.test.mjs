import assert from 'node:assert/strict';
import test from 'node:test';
import { guardRequest, isScannerPath } from '../src/lib/request-guard.ts';

const quotaEnv = limiter => ({ SEARCH_LIMITER: { idFromName: name => name, get: () => ({ async fetch(request) { return Response.json(await limiter.limit(await request.json())); } }) } });

const request = (path, headers = {}) => new Request(`https://practicaltravelgear.com${path}`, {
  headers: { 'CF-Connecting-IP': '192.0.2.1', ...headers },
});

test('scanner URLs stop before any CMS or limiter work; legacy media stays accessible', async () => {
  for (const path of ['/wp-login.php', '/wp-admin/network/plugins.php', '/randkeyword.PhP7', '/.env', '/.env.prod', '/sendgrid.env', '/.git/config', '/%2eenv']) {
    assert.equal(isScannerPath(path), true, path);
    assert.equal((await guardRequest(request(path), {})).status, 403);
  }
  for (const path of ['/wp-content/uploads/bag.php.jpg', '/_emdash/api/media/file/a.env', '/_emdash/admin', '/category/travel-luggage-bags', '/environment-friendly-travel']) {
    assert.equal(isScannerPath(path), false, path);
    assert.equal(await guardRequest(request(path), {}), null);
  }
});

test('search limiter shares counters across UI, API, suggestions and varying query strings', async () => {
  const calls = [];
  const limiter = { async limit({ key }) { calls.push(key); return { success: true }; } };
  for (const path of ['/search?q=bag', '/search/?q=boots', '/_emdash/api/search?q=tote', '/_emdash/api/search/suggest?q=travel']) {
    assert.equal(await guardRequest(request(path), quotaEnv(limiter)), null);
  }
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls).size, 1);
});

test('excess search receives uncacheable retry response; forged credentials cannot bypass limits', async () => {
  const denied = { async limit() { return { success: false }; } };
  const response = await guardRequest(request('/_emdash/api/search?q=bag', { authorization: 'Bearer forged', cookie: 'astro-session=forged' }), quotaEnv(denied));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
});

test('empty searches and normal pages do not consume search quota; oversized queries avoid D1', async () => {
  for (const path of ['/search', '/_emdash/api/search?q=', '/', '/img?src=bag']) assert.equal(await guardRequest(request(path), {}), null);
  assert.equal((await guardRequest(request(`/search?q=${'a'.repeat(201)}`), {})).status, 400);
});

test('missing visitor IP cannot bypass protection', async () => {
  let key;
  const limiter = { async limit(options) { key = options.key; return { success: false }; } };
  const response = await guardRequest(new Request('https://practicaltravelgear.com/_emdash/api/search?q=bag'), quotaEnv(limiter));
  assert.equal(response.status, 429);
  assert.match(key, /^[a-f0-9]{64}$/);
});
