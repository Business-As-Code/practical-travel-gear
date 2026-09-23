import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { handleImg } from '../src/lib/img-transform.ts';
import { originalMediaHeaders } from 'emdash/media/image-endpoint';

// All objects are synthetic: never connect these tests to real R2.
for (const rejected of [false, true]) {
  for (const [contentType, body] of [
    ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"/>'],
    ['text/html', '<script>alert(document.domain)</script>'],
    ['image/png', '<script>/* spoofed raster metadata */</script>'],
    ['image/png; charset=utf-8', '<svg onload="alert(1)"/>'],
    [undefined, '<script>alert(1)</script>'],
  ]) {
    test(`original security policy: ${contentType}, rejected transform=${rejected}`, async () => {
      let reads = 0;
      const env = { MEDIA: { async get() { reads++; return {body: new Response(body).body, httpMetadata: {contentType}}; } } };
      if (rejected) env.IMAGES = { input(stream) { return { transform() { return { async output() {
        await new Response(stream).text();
        throw new Error('synthetic rejected image / quota unavailable');
      } }; } }; } };
      const response = await handleImg(new Request('https://example.test/img?k=fixture.png&w=640'), env);
      assert.equal(response.status, 200);
      for (const [name, value] of Object.entries(originalMediaHeaders(contentType ?? 'application/octet-stream'))) {
        assert.equal(response.headers.get(name), value, name);
      }
      assert.equal(response.headers.get('x-img-transform'), '0');
      assert.equal(await response.text(), body);
      assert.equal(reads, rejected ? 2 : 1);
    });
  }
}

test('asset original fallback gets the same security policy', async () => {
  const response = await handleImg(new Request('https://example.test/img?u=/images/fixture.svg&w=640'), {
    ASSETS: { async fetch() { return new Response('<svg onload="alert(1)"/>', {headers: {'Content-Type':'image/svg+xml'}}); } },
  });
  for (const [name, value] of Object.entries(originalMediaHeaders('image/svg+xml'))) assert.equal(response.headers.get(name), value);
});

test('/img validates parameters before IO and tags transform/fallback responses for native purge', async () => {
  assert.ok(existsSync(new URL('../src/lib/img-transform.ts', import.meta.url)), '/img handler must be restored');
  const { handleImg } = await import('../src/lib/img-transform.ts');
  const req = (params, method='GET') => new Request(`https://example.test/img?${params}`, {method});
  let reads=0;
  const env={MEDIA:{async get(key){reads++; return key==='missing' ? null : {body:new Response('original').body,httpMetadata:{contentType:'image/png'}};}}};
  for (const params of ['k=bag.png&w=640junk','k=../private&w=640','u=https://evil.test/x&w=640','k=bag.png&w=640&f=bad','k=bag.png&w=640&f=constructor','k=bag.png&w=640&f=__proto__','u=/images/bag.png&w=640&f=constructor']) assert.equal((await handleImg(req(params),env)).status,400);
  assert.equal((await handleImg(req('k=bag.png&w=640','POST'),env)).status,405);
  assert.equal(reads,0);
  const fallback=await handleImg(req('k=bag.png&w=640'),env);
  assert.equal(fallback.headers.get('content-type'),'image/png');
  assert.equal(fallback.headers.get('cache-tag'),'media');
  assert.doesNotMatch(fallback.headers.get('cache-control'),/immutable/);
  assert.equal(await fallback.text(),'original');
  assert.equal((await handleImg(req('k=missing&w=640'),env)).status,404);
  env.IMAGES={input(stream){return {transform(options){assert.equal(options.width,640);return {async output(options){assert.equal(options.format,'image/webp');return {response(){return new Response('transformed');}};}};}};}};
  const transformed=await handleImg(req('k=bag.png&w=640'),env);
  assert.equal(transformed.headers.get('content-type'),'image/webp');
  assert.equal(transformed.headers.get('cache-tag'),'media');
  assert.match(transformed.headers.get('cloudflare-cdn-cache-control'),/max-age=300/);
  assert.equal(await transformed.text(),'transformed');
});
