// Native EmDash migrations over Wrangler's supported OAuth remote D1 proxy.
// No credential extraction, custom migration SQL, public server or production seeds.
import {getPlatformProxy} from 'wrangler';
import {createDirectMigrationExecutor} from 'emdash/migrations';
import {r as RawBindingD1Dialect} from '../node_modules/@emdash-cms/cloudflare/dist/d1-dialect-B2ZaQKJR.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [configPath,action,confirmTarget]=process.argv.slice(2);
assert.ok(['check','apply','restore-large'].includes(action));
const config=JSON.parse(await readFile(configPath,'utf8'));
assert.equal(config.d1_databases.length,1);
assert.equal(config.d1_databases[0].database_id,confirmTarget);
assert.equal(config.d1_databases[0].remote,true);
const artifactManifest=JSON.parse(await readFile('.emdash/migrations.json','utf8'));
assert.equal(artifactManifest.emdashVersion,'0.38.0');
assert.equal(artifactManifest.migrationSet.fingerprint,'8414f4f91891e4e0f965235b2b71d210484571268f0f39ba5091881e1cb0ebe7');
const proxy=await getPlatformProxy({configPath,envFiles:[],persist:false,remoteBindings:true});
try{
 if(action==='restore-large'){
  assert.equal(confirmTarget,'c849aa5e-a1c4-4326-a8a6-631d88c6e39d');
  const rows=JSON.parse(await readFile('/home/chrisguill/.hermes/profiles/practical-travel-gear/backups/emdash-production-20260921/large-rows.json','utf8'));
  assert.equal(rows.length,2);
  const results=await proxy.env.DB.batch(rows.map(r=>proxy.env.DB.prepare('INSERT INTO _plugin_storage (plugin_id,collection,id,data,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(r.plugin_id,r.collection,r.id,r.data,r.created_at,r.updated_at)));
  assert.ok(results.every(r=>r.success));console.log(JSON.stringify({largeRowsRestored:results.length}));
 }else{
  const executor=createDirectMigrationExecutor({target:{kind:'d1',label:config.d1_databases[0].database_name,fingerprint:confirmTarget},createDialect:()=>new RawBindingD1Dialect({database:proxy.env.DB})});
  try{
   const report=await executor.execute({action,i18n:null,artifact:{emdashVersion:artifactManifest.emdashVersion,migrationSetFingerprint:artifactManifest.migrationSet.fingerprint}});
   console.log(JSON.stringify(report,null,2));
   await writeFile(`/home/chrisguill/.hermes/profiles/practical-travel-gear/backups/emdash-production-20260921/${confirmTarget}-${action}.json`,JSON.stringify(report,null,2),{mode:0o600});
  }finally{await executor.dispose?.();}
 }
}finally{await proxy.dispose();}
