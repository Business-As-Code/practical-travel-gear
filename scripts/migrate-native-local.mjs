// Local-only native migration runner. Never imported by production build.
import {createDialect} from '@emdash-cms/cloudflare/db/d1';
import {createDirectMigrationExecutor} from 'emdash/migrations';
const artifact={emdashVersion:'0.38.0',migrationSetFingerprint:'8414f4f91891e4e0f965235b2b71d210484571268f0f39ba5091881e1cb0ebe7'};
export default {async fetch(request,env) {
 const url=new URL(request.url);
 if(!['127.0.0.1','localhost'].includes(url.hostname)||request.method!=='POST')return new Response('Forbidden',{status:403});
 if(url.pathname==='/restore-large' && env.TARGET_ID==='c849aa5e-a1c4-4326-a8a6-631d88c6e39d'){
  const rows=await request.json();
  if(rows.length!==2)return new Response('Bad input',{status:400});
  const results=await env.DB.batch(rows.map(r=>env.DB.prepare('INSERT INTO _plugin_storage (plugin_id,collection,id,data,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(r.plugin_id,r.collection,r.id,r.data,r.created_at,r.updated_at)));
  return Response.json({success:results.every(r=>r.success),count:results.length});
 }
 if(!['/check','/apply'].includes(url.pathname))return new Response('Not found',{status:404});
 const input=await request.json();
 if(input.confirmTarget!==env.TARGET_ID)return new Response('Wrong target',{status:400});
 const executor=createDirectMigrationExecutor({target:{kind:'d1',label:env.TARGET_NAME,fingerprint:env.TARGET_ID},createDialect:()=>createDialect({binding:'DB',session:'disabled'})});
 try{return Response.json(await executor.execute({action:url.pathname.slice(1),i18n:null,artifact}));}
 finally{await executor.dispose?.();}
}};
