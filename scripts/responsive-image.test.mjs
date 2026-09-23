import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMedia, keyFromSrc, isSafeImagePath, transformSrc } from '../src/lib/responsive-image.ts';
import { handleImg } from '../src/lib/img-transform.ts';

import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

const prefix = '/_emdash/api/media/file/';

test('ResponsiveImage renders nested native media instead of dropping the image', async () => {
  const source = await readFile(new URL('../src/components/ResponsiveImage.astro', import.meta.url), 'utf8');
  const compiled = await transform(source, {filename:'ResponsiveImage.astro', internalURL:'astro/compiler-runtime', resultScopedSlot:true, resolvePath: s => s});
  const code = stripTypeScriptTypes(compiled.code)
    .replaceAll('astro/compiler-runtime', import.meta.resolve('astro/compiler-runtime'))
    .replaceAll('../lib/responsive-image', new URL('../src/lib/responsive-image.ts', import.meta.url).href);
  const {default: Component} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const container = await AstroContainer.create();
  const html = await container.renderToString(Component, {props:{image:prefix+'authors/fixture.png'}});
  assert.match(html, /<img\s/);
  assert.match(html, /k=authors%2Ffixture.png/);
  assert.match(html, /srcset=/);
  const privateHtml = await container.renderToString(Component, {props:{image:prefix+'backups/fixture.png'}});
  assert.doesNotMatch(privateHtml, /<img\s/);
});
const key = 'authors/fixture.png';
const path = prefix + key;

test('nested native media resolves from paths and storage metadata into a working /img request', async () => {
  for (const image of [path, 'https://practicaltravelgear.com' + path, {src:path}, {storageKey:key}, {meta:{storageKey:key}}]) {
    const media = resolveMedia(image);
    assert.equal(media?.storageKey, key);
    assert.equal(media.src, path);
    assert.equal(keyFromSrc(media.src), key);
    assert.equal(isSafeImagePath(media.src), true);
    const reads = [];
    const response = await handleImg(new Request(new URL(transformSrc(media.src, 640), 'https://example.test')), {
      MEDIA: {async get(requested) { reads.push(requested); return {body:new Response('synthetic PNG').body, httpMetadata:{contentType:'image/png'}}; }},
      IMAGES: {input(stream) { return {transform() { return {async output() { assert.equal(await new Response(stream).text(), 'synthetic PNG'); return {response:() => new Response('synthetic WebP')}; }}; }}; }},
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-img-transform'), '1');
    assert.equal(await response.text(), 'synthetic WebP');
    assert.deepEqual(reads, [key]);
  }
});

test('private prefixes and ambiguous path segments fail before storage or asset IO', async () => {
  for (const invalid of ['backups/fixture.png', 'backups/nested/fixture.png', '../fixture.png', './fixture.png', 'authors/../fixture.png', 'authors/./fixture.png', 'authors//fixture.png', '/fixture.png', 'authors/', '.', '..', 'authors\\fixture.png', 'authors/%2ffixture.png', 'authors/%5cfixture.png', 'authors/%252ffixture.png', 'authors/%2e%2e/fixture.png', 'authors/fixture.png?x=1', 'authors/fixture.png#x']) {
    assert.equal(resolveMedia(prefix + invalid), null, invalid);
    assert.equal(resolveMedia({storageKey:invalid}), null, invalid);
    assert.equal(resolveMedia({meta:{storageKey:invalid}}), null, invalid);
    assert.equal(keyFromSrc(prefix + invalid), undefined, invalid);
    for (const params of [new URLSearchParams({k:invalid,w:'640'}), new URLSearchParams({u:prefix+invalid,w:'640'})]) {
      const response = await handleImg(new Request(`https://example.test/img?${params}`), {
        MEDIA: {async get() { assert.fail('must reject before R2 access'); }},
        ASSETS: {async fetch() { assert.fail('must reject before asset access'); }},
      });
      assert.equal(response.status, 400, invalid);
    }
  }
  for (const source of ['https://practicaltravelgear.com'+prefix+'authors/../fixture.png', 'https://practicaltravelgear.com'+prefix+'authors/%2e%2e/fixture.png']) assert.equal(resolveMedia(source), null, source);
});
