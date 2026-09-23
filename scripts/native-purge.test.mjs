import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNativePurgeSuccess } from '../src/lib/native-purge.ts';
test('native invalidation fails closed when Cloudflare reports success false', () => {
 assert.throws(()=>assertNativePurgeSuccess({success:false,errors:[{code:1,message:'fixture rejection'}]}),/Native cache purge failed/);
 assert.doesNotThrow(()=>assertNativePurgeSuccess({success:true,errors:[]}));
});
