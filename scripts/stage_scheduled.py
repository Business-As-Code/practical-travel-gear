import json,time
from pathlib import Path
from stage_client import call,db
report={}
def check_fetch(path):
 r=call(path)
 return {'status':r['status'],'cache':r['headers'].get('CF-Cache-Status'),'invocation':r['headers'].get('X-Stage-Invocation'),'containsDue':'Synthetic scheduled fixture' in r['body'] or '/stage-due' in r['body'],'containsPrivate':'PRIVATE DRAFT SENTINEL' in r['body'] or 'PRIVATE FUTURE SENTINEL' in r['body']}
# Set fixture due only after prior smoke requests; not production data.
db("UPDATE ec_posts SET status='draft',scheduled_at='2000-01-01T00:00:00Z',published_at=NULL WHERE id='stage-due'; INSERT OR IGNORE INTO ec_posts(id,slug,title,status,scheduled_at,deleted_at,content) VALUES('stage-deleted','stage-deleted','PRIVATE DELETED SENTINEL','draft','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z','[]');")
report['beforeRows']=db("SELECT id,status,scheduled_at,deleted_at FROM ec_posts ORDER BY id")[0]['results']
report['preparationPurge']=call('/__stage/purge','POST',True)
paths=['/','/rss.xml','/sitemap-posts.xml','/sitemap.xml']
def warm(path):
 records=[]
 for _ in range(8):
  records.append(check_fetch(path))
  if len(records)>1 and records[-1]['cache']=='HIT':return records
  time.sleep(0.3)
 return records
report['before']={p:warm(p) for p in paths}
Path('.wrangler/stage-scheduled-results.json').write_text(json.dumps(report,indent=2))
for p,rs in report['before'].items():
 assert rs[-1]['cache']=='HIT',(p,rs)
 assert not rs[-1]['containsDue'],(p,'published before controlled handler')
report['scheduled']=call('/__stage/scheduled','POST',True)
report['afterRows']=db("SELECT id,status,scheduled_at,published_at,deleted_at FROM ec_posts ORDER BY id")[0]['results']
report['after']={p:warm(p) for p in paths}
report['nativeFailure']=call('/__stage/purge-failure','POST',True)
Path('.wrangler/stage-scheduled-results.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
rows={r['id']:r for r in report['afterRows']}
assert rows['stage-due']['status']=='published'
for key in ['stage-future','stage-deleted','stage-draft']:assert rows[key]['status']=='draft'
result=json.loads(report['scheduled']['body']);assert result['purges'] and all(p['result']['success'] for p in result['purges'])
for p,rs in report['after'].items():
 assert rs[0]['invocation']!=report['before'][p][-1]['invocation'],(p,'stale warmed response')
 assert rs[-1]['cache']=='HIT',(p,rs)
 if p!='/sitemap.xml':assert rs[-1]['containsDue'],(p,'published item missing')
 assert not rs[-1]['containsPrivate']
print('PASS: publication AND actual native purge AND warmed homepage/RSS/sitemap refresh')
