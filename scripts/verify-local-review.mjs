import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Disposable local D1 only, exercised through the real built Worker / EmDash API.
const origin = 'http://127.0.0.1:4329';
const prefix = `review-${randomUUID()}`;
const db = sql => JSON.parse(execFileSync('node_modules/.bin/wrangler', [
  'd1','execute','ptg-cleanup-local-only','--config','wrangler.local.json','--local',
  '--persist-to','.wrangler/cleanup-local','--json','--command',sql,
], {encoding:'utf8',env:{...process.env,CLOUDFLARE_API_TOKEN:'',CLOUDFLARE_ACCOUNT_ID:'',WRANGLER_SEND_METRICS:'false'}}));
try {
  db(`INSERT INTO media(id,filename,mime_type,storage_key) VALUES ('${prefix}-media','portrait.png','image/png','authors/${prefix}-portrait.png');
    INSERT INTO _emdash_bylines(id,slug,display_name,bio,avatar_media_id,translation_group) VALUES ('${prefix}-localized','${prefix}','Local Review Author','Populated author fixture','${prefix}-media','${prefix}-group');
    INSERT INTO ec_posts(id,slug,title,status,published_at,content) VALUES ('${prefix}-post','${prefix}-story','Review Story','published','2026-01-01T00:00:00Z','[]');
    INSERT INTO ec_guides(id,slug,title,status,published_at,content) VALUES ('${prefix}-guide','${prefix}-guide','Review Guide','published','2026-01-01T00:00:00Z','[]');
    INSERT INTO _emdash_content_bylines(id,collection_slug,content_id,byline_id) VALUES ('${prefix}-post-credit','posts','${prefix}-post','${prefix}-group'),('${prefix}-guide-credit','guides','${prefix}-guide','${prefix}-group');`);
  const response = await fetch(`${origin}/authors/${prefix}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const expected of ['Local Review Author','Populated author fixture',`/_emdash/api/media/file/authors/${prefix}-portrait.png`,`href="/${prefix}-story"`,`href="/guides/${prefix}-guide"`]) assert.ok(html.includes(expected), `missing ${expected}`);
  assert.ok(!html.includes(`/_emdash/api/media/file/${prefix}-media`));
  for (const format of ['constructor','__proto__']) {
    const invalid = await fetch(`${origin}/img?k=missing&w=640&f=${format}`);
    assert.equal(invalid.status, 400);
  }
  const chair = await fetch(`${origin}/guides/best-basic-camping-chairs`, {redirect:'manual'});
  assert.equal(chair.status, 404, 'unseeded canonical guide must not redirect to itself');
  console.log('Local review smoke passed: populated author, hydrated avatar storage key, translated story/guide credits, inherited image formats and no chair self redirect. Avatar object bytes were not seeded or fetched.');
} finally {
  db(`DELETE FROM _emdash_content_bylines WHERE id IN ('${prefix}-post-credit','${prefix}-guide-credit');
    DELETE FROM ec_posts WHERE id='${prefix}-post'; DELETE FROM ec_guides WHERE id='${prefix}-guide';
    DELETE FROM _emdash_bylines WHERE id='${prefix}-localized'; DELETE FROM media WHERE id='${prefix}-media';`);
  const remaining = db(`SELECT (SELECT count(*) FROM _emdash_bylines WHERE id='${prefix}-localized') + (SELECT count(*) FROM media WHERE id='${prefix}-media') + (SELECT count(*) FROM ec_posts WHERE id='${prefix}-post') + (SELECT count(*) FROM ec_guides WHERE id='${prefix}-guide') + (SELECT count(*) FROM _emdash_content_bylines WHERE id IN ('${prefix}-post-credit','${prefix}-guide-credit')) AS remaining`)[0].results[0].remaining;
  assert.equal(remaining, 0, 'fixture cleanup read-back');
}
