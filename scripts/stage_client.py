import json, os, subprocess, urllib.request, urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='https://ptg-emdash-stage-20260921.odd-hill-1be0.workers.dev'
SECRET=Path('/home/chrisguill/.hermes/profiles/practical-travel-gear/secrets/ptg-emdash-stage-20260921.json')
def call(path,method='GET',protected=False,headers=None):
 h={'User-Agent':'Mozilla/5.0 PTG-Isolated-Staging-Verification',**(headers or {})}
 if protected:h['Authorization']='Bearer '+json.loads(SECRET.read_text())['STAGE_HARNESS_SECRET']
 req=urllib.request.Request(ORIGIN+path,method=method,headers=h)
 try:r=urllib.request.urlopen(req,timeout=120)
 except urllib.error.HTTPError as e:r=e
 body=r.read()
 return {'status':r.status,'headers':dict(r.headers),'body':body.decode(errors='replace')}
def wrangler(*args):
 env=dict(os.environ)
 for k in ['CF_API_TOKEN','CLOUDFLARE_API_TOKEN','CF_ACCOUNT_ID']:env.pop(k,None)
 env.update(CLOUDFLARE_ACCOUNT_ID='eddf7805053d5e32afd090c3ec22126c',WRANGLER_SEND_METRICS='false')
 r=subprocess.run([str(ROOT/'node_modules/.bin/wrangler'),*args],cwd=ROOT,env=env,capture_output=True,text=True)
 if r.returncode:raise RuntimeError(r.stdout+r.stderr)
 return r.stdout
def db(sql):return json.loads(wrangler('d1','execute','ptg-emdash-stage-20260921','--config','wrangler.stage.json','--remote','--json','--command',sql))
if __name__=='__main__':
 import sys
 result=call(sys.argv[1],sys.argv[2] if len(sys.argv)>2 else 'GET',True)
 print(json.dumps(result,indent=2))
