import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
test('production provider contains no staging purge observer',async()=>{
 const result=await build({entryPoints:['src/lib/native-cache-provider.ts'],bundle:true,write:false,format:'esm',packages:'external',minify:true,define:{'import.meta.env.PTG_STAGING':'false'}});
 assert.ok(!result.outputFiles[0].text.includes('staging-purge-observer'));
 assert.ok(result.outputFiles[0].text.includes('purge('));
});
