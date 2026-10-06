// Disposable staging entry only; production never imports this module.
import app from './protected-worker';
import nativeCacheProvider from './lib/native-cache-provider';
import { Kysely } from 'kysely';
import { applySeed, type SeedFile } from 'emdash/seed';
import seed from '../seed/stage.json';
import { cache } from 'cloudflare:workers';
import { createDialect } from '@emdash-cms/cloudflare/db/d1';
import { createDirectMigrationExecutor, getCoreMigrationIdentity } from 'emdash/migrations';
export { PluginBridge, PublicSearchLimiter } from './protected-worker';
const safe = (body: unknown, status=200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive'}});
export default {
 async fetch(request: Request, env: any, ctx: any) {
  const path = new URL(request.url).pathname;
  if(path.startsWith('/__stage/')) {
   if(!env.STAGE_HARNESS_SECRET || request.headers.get('Authorization') !== `Bearer ${env.STAGE_HARNESS_SECRET}`) return safe({error:'forbidden'},403);
   try {
    if(path==='/__stage/images') {
     const object=await env.MEDIA.get('stage-synthetic.png');
     const output=await env.IMAGES.input(object.body).transform({width:320,fit:'scale-down'}).output({format:'image/webp',quality:75});
     return safe({status:output.response().status});
    }
    if(path==='/__stage/personal') return safe({personal:'STAGE PRIVATE PERSONAL SENTINEL'});
    if(path==='/__stage/purge-failure-checked' && request.method==='POST') {
     await nativeCacheProvider().invalidate({tags:['x'.repeat(2048)]});
     return safe({unexpectedSuccess:true});
    }
    if(path==='/__stage/purge-failure' && request.method==='POST') {
     const result=await cache.purge({tags:['x'.repeat(2048)]});
     return safe(result);
    }
    if(path==='/__stage/probe') return safe({version:env.CF_VERSION_METADATA,cachePurge:typeof cache.purge,images:typeof env.IMAGES?.input});
    if(path==='/__stage/migrate' && request.method==='POST') {
     const identity=await getCoreMigrationIdentity();
     const executor=createDirectMigrationExecutor({target:{kind:'d1',label:'isolated-stage',fingerprint:'083299a5-13df-491b-9dca-333828cd5d86'},createDialect:()=>createDialect({binding:'DB',session:'disabled'})});
     try { return safe(await executor.execute({action:'apply',i18n:null,artifact:{emdashVersion:identity.emdashVersion,migrationSetFingerprint:identity.fingerprint}})); }
     finally { await executor.dispose?.(); }
    }
    if(path==='/__stage/seed' && request.method==='POST') {
     const db=new Kysely({dialect:createDialect({binding:'DB',session:'disabled'})});
     try {return safe(await applySeed(db,seed as SeedFile,{includeContent:false,skipMediaDownload:true}));} finally {await db.destroy();}
    }
    if(path==='/__stage/purge' && request.method==='POST') return safe(await cache.purge({tags:['posts','pages','guides']}));
    if(path==='/__stage/scheduled' && request.method==='POST') {
     const pending: Promise<unknown>[]=[];
     const purges: unknown[]=[];
     const key=Symbol.for('ptg:staging-purge-observer');
     (globalThis as any)[key]=(value:unknown)=>purges.push(value);
     try {
      app.scheduled({cron:'*/5 * * * *',scheduledTime:Date.now(),noRetry(){}},env,{...ctx,waitUntil:(p:Promise<unknown>)=>pending.push(p)});
      await Promise.all(pending);
      return safe({handlerCompleted:true,purges,warning:'native handler catches errors; confirm DB publication independently'});
     } finally {delete (globalThis as any)[key];}
    }
    return safe({error:'not-found'},404);
   } catch(error) { return safe({error:String(error)},500); }
  }
  // Deny admin/setup and every external mutation before application dispatch.
  if(!['GET','HEAD'].includes(request.method) || (path.startsWith('/_emdash') && !path.startsWith('/_emdash/api/media/file/'))) return safe({error:'staging-read-only'},403);
  if(path==='/robots.txt') return new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain','X-Robots-Tag':'noindex','Cache-Control':'no-store'}});
  const response=await app.fetch(request,env,ctx);
  const result=new Response(response.body,response);
  result.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  // Disable browser analytics, external scripts and form delivery in staging.
  result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'none'; frame-src 'none'");
  result.headers.set('X-Stage-Invocation',crypto.randomUUID());
  return result;
 }
};
