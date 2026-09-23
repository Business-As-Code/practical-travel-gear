import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Local runtime capability probe, not a production endpoint or a purge shim.
for (const compatibilityDate of ['2026-03-29', '2026-09-18']) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    compatibilityDate,
    compatibilityFlags: ['nodejs_compat'],
    script: `import { cache } from 'cloudflare:workers';
      export default { fetch(request, env, ctx) {
        return Response.json({ importedPurge: typeof cache?.purge, contextPurge: typeof ctx.cache?.purge });
      }};`,
  }));
  try {
    const capabilities = await (await mf.dispatchFetch('http://localhost/')).json();
    console.log(JSON.stringify({ compatibilityDate, ...capabilities }));
    assert.equal(capabilities.importedPurge, capabilities.contextPurge);
  } finally {
    await mf.dispose();
  }
}
