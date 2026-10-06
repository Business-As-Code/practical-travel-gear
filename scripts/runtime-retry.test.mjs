import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithRuntimeRetry } from '../src/lib/runtime-retry.ts';
test('transient marked CMS failures recover on one safe retry; persistent failures stay uncached', async () => {
  const fail = () => new Response('temporary', {status:503, headers:{'X-PTG-Runtime-Unavailable':'1','Cache-Control':'private, no-store'}});
  let calls=0;
  const recovered=await fetchWithRuntimeRetry(new Request('https://example.com/article'),async()=>++calls===1?fail():new Response('article'));
  assert.equal(calls,2);assert.equal(await recovered.text(),'article');
  calls=0;
  const persistent=await fetchWithRuntimeRetry(new Request('https://example.com/article'),async()=>{calls++;return fail();});
  assert.equal(calls,2);assert.equal(persistent.status,503);assert.match(persistent.headers.get('Cache-Control'),/no-store/);
});
test('mutations, genuine missing content and unmarked failures are never retried',async()=>{
  for(const [method,status,marker] of [['POST',503,'1'],['GET',404,'1'],['GET',503,'0']]){
    let calls=0;const response=await fetchWithRuntimeRetry(new Request('https://example.com/',{method}),async()=>{calls++;return new Response('',{status,headers:{'X-PTG-Runtime-Unavailable':marker}});});
    assert.equal(calls,1);assert.equal(response.status,status);
  }
});
