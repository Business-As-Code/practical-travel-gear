import json
from stage_client import call
from pathlib import Path
records=[]
for label,headers in [('anonymous-cold',{}),('anonymous-warm',{}),('authorization',{'Authorization':'Bearer synthetic-invalid'}),('session',{'Cookie':'emdash_session=synthetic-invalid'}),('astro-session',{'Cookie':'astro-session=synthetic-invalid'}),('edit',{'Cookie':'emdash-edit-mode=true'}),('preview',{'Cookie':'emdash_preview=synthetic-invalid'})]:
 r=call('/',headers=headers)
 records.append({'case':label,'status':r['status'],'cache':r['headers'].get('CF-Cache-Status'),'invocation':r['headers'].get('X-Stage-Invocation'),'vary':r['headers'].get('Vary')})
Path('.wrangler/stage-private-cache-results.json').write_text(json.dumps(records,indent=2))
print(json.dumps(records,indent=2))
assert records[1]['cache']=='HIT', 'must test a warmed native cache'
for r in records[2:]:
 assert r['cache']!='HIT', f"private request served from anonymous cache: {r['case']}"
 assert r['invocation']!=records[1]['invocation'], f"private request did not reach Worker: {r['case']}"
