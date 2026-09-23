import json,urllib.request,urllib.error,io,hashlib
from PIL import Image
from pathlib import Path
from stage_client import call,ORIGIN
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
def raw(path):
 try:r=opener.open(urllib.request.Request(ORIGIN+path,headers={'User-Agent':'Mozilla/5.0'}),timeout=60)
 except urllib.error.HTTPError as e:r=e
 return r.status,dict(r.headers),r.read()
report={'routes':{},'images':{},'security':{},'blockers':[]}
for path,expected,needle in [('/authors',200,'Synthetic Listed Author'),('/authors/stage-author',200,'Synthetic public fixture'),('/authors/nonexistent',404,None),('/stage-public',200,'Synthetic public fixture'),('/stage-draft',404,None),('/stage-future',404,None),('/stage-deleted',404,None),('/nonexistent-stage-404',404,None),('/feed',301,None),('/rss',301,None),('/posts/stage-public',301,None),('/pages/stage-public',301,None)]:
 status,headers,body=raw(path)
 report['routes'][path]={'status':status,'location':headers.get('Location'),'noindex':headers.get('X-Robots-Tag'),'needleFound':needle in body.decode(errors='replace') if needle else None}
 assert status==expected,(path,status)
 if needle:assert needle.encode() in body,(path,'missing fixture')
 assert b'PRIVATE DRAFT SENTINEL' not in body and b'PRIVATE FUTURE SENTINEL' not in body
for fmt in ['webp','avif','jpeg']:
 path='/img?k=stage-synthetic.png&w=320&f='+fmt
 status,headers,body=raw(path)
 im=Image.open(io.BytesIO(body))
 report['images'][fmt]={'status':status,'transform':headers.get('X-Img-Transform'),'contentType':headers.get('Content-Type'),'size':im.size,'format':im.format,'sha256':hashlib.sha256(body).hexdigest()}
 if not(status==200 and headers.get('X-Img-Transform')=='1' and im.size==(320,160)):
  report['blockers'].append('Real IMAGES transformation failed: '+fmt)
report['imageProbe']=call('/__stage/images',protected=True)
for path,method in [('/_emdash/admin','GET'),('/_emdash/api/setup','POST'),('/_emdash/api/content/posts','POST'),('/__stage/probe','GET'),('/','POST')]:
 r=call(path,method)
 report['security'][path+':'+method]={'status':r['status'],'cache':r['headers'].get('CF-Cache-Status')}
 assert r['status']==403
personal=call('/__stage/personal',protected=True);anonymous=call('/__stage/personal')
assert 'STAGE PRIVATE PERSONAL SENTINEL' in personal['body']
assert anonymous['status']==403 and 'SENTINEL' not in anonymous['body']
report['personal']={'protectedStatus':personal['status'],'protectedCache':personal['headers'].get('CF-Cache-Status'),'anonymousStatus':anonymous['status'],'anonymousCache':anonymous['headers'].get('CF-Cache-Status')}
Path('.wrangler/stage-smoke-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
assert not report['blockers'],report['blockers']
