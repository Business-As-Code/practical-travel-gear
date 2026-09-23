import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { scheduledValidationReport } from './scheduled-validation.mjs';

const origin='http://127.0.0.1:4329';
const db = sql => {
  const text=execFileSync('node_modules/.bin/wrangler',['d1','execute','ptg-cleanup-local-only','--config','wrangler.local.json','--local','--persist-to','.wrangler/cleanup-local','--json','--command',sql],{encoding:'utf8',env:{...process.env,CLOUDFLARE_API_TOKEN:'',CLOUDFLARE_ACCOUNT_ID:'',WRANGLER_SEND_METRICS:'false'}});
  return JSON.parse(text);
};
// Disposable, explicitly local records only. No production IDs or CMS credentials.
db(`DELETE FROM ec_posts WHERE id IN ('cleanup-due','cleanup-future','cleanup-deleted');
INSERT INTO ec_posts (id,slug,title,status,scheduled_at,content) VALUES ('cleanup-due','cleanup-due','Local scheduled fixture','draft','2000-01-01T00:00:00.000Z','[]');
INSERT INTO ec_posts (id,slug,title,status,scheduled_at,content) VALUES ('cleanup-future','cleanup-future','Local future fixture','draft','2099-01-01T00:00:00.000Z','[]');
INSERT INTO ec_posts (id,slug,title,status,scheduled_at,deleted_at,content) VALUES ('cleanup-deleted','cleanup-deleted','Local deleted fixture','draft','2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z','[]');`);
try {
  const response=await fetch(`${origin}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent('*/5 * * * *')}`);
  assert.equal(response.status,200);
  let rows;
  for(let attempt=0;attempt<30;attempt++) {
    rows=db("SELECT id,status,scheduled_at,published_at FROM ec_posts WHERE id LIKE 'cleanup-%' ORDER BY id")[0].results;
    if(rows.find(r=>r.id==='cleanup-due')?.status==='published') break;
    await new Promise(r=>setTimeout(r,100));
  }
  const due=rows.find(r=>r.id==='cleanup-due');
  assert.equal(due.status,'published');
  assert.equal(due.scheduled_at,null);
  assert.ok(due.published_at);
  assert.equal(rows.find(r=>r.id==='cleanup-future').status,'draft');
  assert.equal(rows.find(r=>r.id==='cleanup-deleted').status,'draft');
  const post=await fetch(`${origin}/cleanup-due`);
  assert.equal(post.status,200);
    assert.match(await post.text(),/Local scheduled fixture/);
  const homepage=await fetch(origin);
  assert.match(await homepage.text(),/Local scheduled fixture/);
  const sitemap=await fetch(`${origin}/sitemap-posts.xml`);
  assert.match(await sitemap.text(),/cleanup-due/);
  const rss=await fetch(`${origin}/rss.xml`);
  assert.match(await rss.text(),/cleanup-due/);
  const migrations=db('SELECT name FROM _emdash_migrations ORDER BY name')[0].results.map(r=>r.name);
  assert.ok(migrations.includes('075_entry_edit_locks'));
  assert.ok(migrations.includes('077_plugin_storage_revisions'));
  assert.equal(migrations.length,76);
  const report = scheduledValidationReport({rows, migrations});
  await writeFile('.wrangler/local-scheduled-results.json',JSON.stringify(report,null,2)+'\n');
  console.log(`Publication assertions passed (due published, future/deleted retained); ${migrations.length} local migrations verified. This does NOT verify native invalidation.`);
  console.error(`DEPLOYMENT BLOCKED: ${report.nativeInvalidation.reason}`);
  process.exitCode = report.exitCode;
} finally {
  db("DELETE FROM ec_posts WHERE id IN ('cleanup-due','cleanup-future','cleanup-deleted')");
  assert.equal(db("SELECT count(*) AS remaining FROM ec_posts WHERE id IN ('cleanup-due','cleanup-future','cleanup-deleted')")[0].results[0].remaining, 0, 'local fixture cleanup read-back');
}
