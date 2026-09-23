import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const origin = process.env.PTG_SMOKE_ORIGIN ?? 'http://127.0.0.1:4329';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname), 'Local smoke must never target production');
const cases = [
  ['/',200],['/posts',200],['/posts?page=2',200],['/posts?page=Infinity',200],['/guides',200],
  ['/authors',200],['/subscribe',200],['/rss.xml',200],['/sitemap.xml',200],['/sitemap-posts.xml',200],['/sitemap-pages.xml',200],['/llms.txt',200],['/robots.txt',200],['/ads.txt',200],
  ['/feed',301,'/rss.xml'],['/rss',301,'/rss.xml'],['/author/jill-robinson',301,'/authors/jill'],['/page/2',301,'/'],['/page/3',301,'/posts'],
  ['/2020/05/example',301,'/example'],['/unknown/deep/route',404],['/nonexistent-fixture-slug',404],['/category/nonexistent-fixture-term',404],['/tag/nonexistent-fixture-term',404],['/authors/nonexistent-fixture-author',404],
  ['/img?k=missing&w=640',404],['/img?k=missing&w=640junk',400],['/img?u=https://evil.example/x&w=640',400]
];
const results=[];
for (const [path,status,location] of cases) {
  const res=await fetch(new URL(path,origin),{redirect:'manual'});
  const body=await res.text();
  results.push({path,status:res.status,location:res.headers.get('location'),cache:res.headers.get('cloudflare-cdn-cache-control'),bytes:body.length});
  assert.equal(res.status,status,`${path}: ${body.slice(0,200)}`);
  if(location) assert.equal(new URL(res.headers.get('location'),origin).pathname,location,path);
  if(status===404) { assert.equal(res.headers.get('location'),null); assert.match(res.headers.get('cache-control'),/no-store/); }
  if(path==='/subscribe') assert.match(body,/RSS feed/);
  if(path==='/sitemap-pages.xml') assert.match(body,/\/authors/);
}
await writeFile(new URL('../.wrangler/local-smoke-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(`Local smoke: ${results.length} route assertions passed`);
