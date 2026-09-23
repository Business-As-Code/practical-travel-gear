import {getPlatformProxy} from 'wrangler';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='/home/chrisguill/.hermes/profiles/practical-travel-gear/backups/emdash-production-20260921';
const source=new DatabaseSync(':memory:');source.exec(await readFile(root+'/production-restore-ordered.sql','utf8'));
const migrated=process.argv.includes('--migrated');
const tables=Object.keys(JSON.parse(await readFile(root+'/logical-backup-metadata.json','utf8')).counts).filter(t=>!migrated||t!=='_emdash_migrations');
const normalize=v=>ArrayBuffer.isView(v)?Array.from(v):v instanceof ArrayBuffer?Array.from(new Uint8Array(v)):v;
const digest=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>JSON.stringify(Object.fromEntries(Object.entries(r).map(([k,v])=>[k,normalize(v)]).sort(([a],[b])=>a.localeCompare(b))))).sort())).digest('hex');
const proxy=await getPlatformProxy({configPath:'.wrangler/migrate-recovery.json',envFiles:[],persist:false,remoteBindings:true});
try{
 const evidence={tables:[],schemaMatch:false,foreignKeysClean:false};
 for(const t of tables){
  assert.match(t,/^[a-zA-Z_][a-zA-Z0-9_]*$/);
  const cols=source.prepare(`PRAGMA table_info("${t}")`).all().map(c=>'"'+c.name+'"').join(',');
  const sql=`SELECT ${cols} FROM "${t}"`;
  const expected=source.prepare(sql).all();const result=await proxy.env.DB.prepare(sql).all();
  assert.equal(result.success,true);
  assert.equal(digest(result.results),digest(expected),'Table content mismatch: '+t);
  evidence.tables.push({table:t,count:expected.length,sha256:digest(expected)});
 }
 const query="SELECT name,type,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name";
 const remote=(await proxy.env.DB.prepare(query).all()).results;
 const local=source.prepare(query).all();
 if(!migrated){assert.equal(digest(remote),digest(local),'Schema mismatch');evidence.schemaMatch=true;}
 else {for(const original of local.filter(s=>s.type==='trigger'||s.type==='index'))assert.ok(remote.some(s=>s.name===original.name&&s.sql===original.sql));evidence.originalIndexesTriggersRetained=true;}
 assert.equal((await proxy.env.DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);evidence.foreignKeysClean=true;
 await writeFile(root+(migrated?'/remote-migrated-verification.json':'/remote-restore-verification.json'),JSON.stringify(evidence,null,2),{mode:0o600});
 console.log(JSON.stringify({...evidence,tables:undefined,matchedTables:evidence.tables.length}));
}finally{source.close();await proxy.dispose();}
