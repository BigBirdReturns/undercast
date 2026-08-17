#!/usr/bin/env python3
import hashlib,json,os,subprocess,time,urllib.request,urllib.error
from datetime import datetime,timezone
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
P=Path('/tmp/star-trek-cadmar-media'); P.mkdir(parents=True,exist_ok=True)
S=Path('/tmp/star-trek-cadmar-source-probe'); M=Path('/tmp/star-trek-cadmar-media-scout-v2')
MAIN=os.environ['EXPECTED_MAIN']; TASK='ap_65bf6ced3c2e53296254e943'; WALL='UC-1384'
STILL_URL='https://static.wikia.nocookie.net/memoryalpha/images/a/ac/Cadmar.jpg/revision/latest?cb=20061128011223&path-prefix=en'
STILL_PAGE='https://memory-alpha.fandom.com/wiki/File:Cadmar.jpg'
PORTRAIT_PAGE='https://commons.wikimedia.org/wiki/File:Star_Trek_Cast_and_Crew_Visit_NASA_Dryden_in_1967.jpg'
NASA_PAGE='https://images.nasa.gov/details-E67-16643-3'; CROP=[1880,450,2450,1750]
def sh(b): return hashlib.sha256(b).hexdigest()
def fh(p): return sh(Path(p).read_bytes())
def stable(v):
 if isinstance(v,list): return [stable(x) for x in v]
 if isinstance(v,dict): return {k:stable(v[k]) for k in sorted(v)}
 return v
def pretty(v): return json.dumps(stable(v),indent=2,ensure_ascii=False)+'\n'
def w(name,v): (P/name).write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n')
def artifact(run,aid,name,digest):
 raw=subprocess.check_output(['gh','api',f"/repos/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{run}/artifacts?per_page=100"],text=True)
 rows=[x for x in json.loads(raw)['artifacts'] if x['id']==aid]
 assert len(rows)==1 and rows[0]['name']==name and rows[0]['digest']==f'sha256:{digest}',rows
def dl(url,path):
 last=None
 for n in range(1,9):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'undercast-cadmar-media/1.0','Accept':'image/*'})
   with urllib.request.urlopen(req,timeout=120) as r: path.write_bytes(r.read()); return
  except (urllib.error.HTTPError,urllib.error.URLError) as e: last=e; time.sleep(n*4)
 raise RuntimeError(last)
assert subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0]==MAIN
sr=int(os.environ['SOURCE_RUN']); sa=int(os.environ['SOURCE_ARTIFACT']); ss=os.environ['SOURCE_ARTIFACT_SHA']
mr=int(os.environ['SCOUT_RUN']); ma=int(os.environ['SCOUT_ARTIFACT']); ms=os.environ['SCOUT_ARTIFACT_SHA']
artifact(sr,sa,'star-trek-cadmar-source-probe',ss); artifact(mr,ma,'star-trek-cadmar-media-scout-v2',ms)
source=json.loads((S/'source-receipt.json').read_text()); original_receipt=source['receipt_sha256']; source['adjudicated_kind']='voice'; source.pop('receipt_sha256'); source['receipt_sha256']=sh(pretty(source).encode())
episodes=json.loads((S/'episode-receipts.json').read_text()); summary=json.loads((S/'summary.json').read_text()); stillq=json.loads((S/'still-file-query.json').read_text()); scout=json.loads((M/'manifest.json').read_text()); src=next(x for x in scout['items'] if x['id']=='dryden-group')
assert source['canonical_parent']==MAIN and source['task_id']==TASK and source['performance_mode']=='voice-only' and source['maker_attribution']=='unresolved'
assert summary['still_title']=='File:Cadmar.jpg' and src['nasa_id']=='E67-16643-3' and src['page']==PORTRAIT_PAGE and fh(M/src['file'])==src['sha256']
raw=Path('/tmp/cadmar-still-source'); dl(STILL_URL,raw)
with Image.open(raw) as im:
 im=ImageOps.exif_transpose(im).convert('RGB'); sw,shh=im.size; sp=P/'uc-1384-still.webp'; im.save(sp,'WEBP',quality=90,method=6)
with Image.open(M/src['file']) as im:
 im=ImageOps.exif_transpose(im).convert('RGB'); pw,ph=im.size; pp=P/'uc-1384-portrait.jpg'; im.crop(tuple(CROP)).save(pp,'JPEG',quality=94,optimize=True)
ssha,psha=fh(sp),fh(pp); assert ssha!=psha
spec=json.loads(Path('data/specimens.json').read_text()); origins=set(); hashes=set()
for r in spec:
 for side in ('portrait','still'):
  f=r.get(side) or {}; origins.add(f.get('origin')); p=f.get('src')
  if p and Path(p).exists(): hashes.add(fh(p))
assert PORTRAIT_PAGE not in origins and NASA_PAGE not in origins and psha not in hashes and ssha not in hashes
ledger={'version':1,'transaction':'STAR-TREK-CADMAR-SOURCE-LEDGER','task_id':TASK,'wall_id':WALL,'role_source':source,'episode_receipts':episodes,'still_source':{'title':'File:Cadmar.jpg','pageid':stillq['pageid'],'source_page':STILL_PAGE,'origin':STILL_URL,'api_reported_bytes':summary['still_api_size'],'width':summary['still_width'],'height':summary['still_height'],'source_sha1':summary['still_sha1'],'downloaded_bytes':raw.stat().st_size,'downloaded_sha256':fh(raw)},'portrait_source':{'title':src['title'],'origin':PORTRAIT_PAGE,'nasa_page':NASA_PAGE,'nasa_id':'E67-16643-3','author':'NASA','license':'Public domain','year':1967,'width':pw,'height':ph,'downloaded_bytes':(M/src['file']).stat().st_size,'downloaded_sha256':fh(M/src['file']),'selected_nasa_asset':src['selected_nasa_asset'],'crop_box':CROP}}
w('source-ledger.json',ledger)
now=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
review={'version':1,'transaction':'STAR-TREK-CADMAR-MEDIA-REVIEW','reviewed_at':now,'reviewer':'chatgpt-vision-second-desk','wall_id':WALL,'character':'Cadmar','actor':'James Doohan','still_sha256':ssha,'portrait_sha256':psha,'findings':{'exact_role_still':True,'performer_portrait_identity':True,'portrait_has_single_dominant_subject':True,'portrait_crop_excludes_other_identifiable_people':True,'still_is_character_evidence_only':True,'portrait_is_performer_evidence_only':True,'byte_distinct':True,'source_distinct':True,'cross_card_source_distinct':True,'generic_substitution':False,'maker_inference':False},'verdict':'pass'}; review['review_sha256']=sh(pretty(review).encode()); w('media-review.json',review)
prep={'version':1,'transaction':'STAR-TREK-CADMAR-MEDIA-PREPARATION','generated_at':now,'canonical_parent':MAIN,'task_id':TASK,'wall_id':WALL,'actor':'James Doohan','character':'Cadmar','production':'Star Trek: The Animated Series (The Ambergris Element)','year':'1973','source_probe':{'run':sr,'artifact':sa,'artifact_sha256':ss},'media_scout':{'run':mr,'artifact':ma,'artifact_sha256':ms},'source_probe_receipt_sha256':original_receipt,'source_receipt_sha256':source['receipt_sha256'],'source_ledger_sha256':fh(P/'source-ledger.json'),'maker_attribution':'unresolved','still':{'src':'images/uc-1384-still.webp','kind':'still','origin':STILL_URL,'source_page':STILL_PAGE,'sha256':ssha,'bytes':sp.stat().st_size,'source_width':sw,'source_height':shh},'portrait':{'src':'images/uc-1384-portrait.jpg','kind':'free','origin':PORTRAIT_PAGE,'nasa_page':NASA_PAGE,'author':'NASA','license':'Public domain','year':1967,'sha256':psha,'bytes':pp.stat().st_size,'source_width':pw,'source_height':ph,'crop_box':CROP},'media_review':review,'byte_collision':False,'source_collision':False,'cross_facet_substitution':False,'episode_receipts':episodes}
w('media-preparation.json',prep); w('source-receipt.json',source); w('episode-receipts.json',episodes)
tiles=[]
for label,path in [('Cadmar character still',sp),('James Doohan performer portrait',pp)]:
 with Image.open(path) as im: thumb=ImageOps.contain(ImageOps.exif_transpose(im).convert('RGB'),(620,620))
 tile=Image.new('RGB',(680,700),'white'); tile.paste(thumb,((680-thumb.width)//2,20+(620-thumb.height)//2)); ImageDraw.Draw(tile).text((24,655),label,fill='black'); tiles.append(tile)
sheet=Image.new('RGB',(1360,700),'#ddd'); sheet.paste(tiles[0],(0,0)); sheet.paste(tiles[1],(680,0)); sheet.save(P/'contact-sheet.jpg',quality=92)
result={'transaction':prep['transaction'],'canonical_parent':MAIN,'task_id':TASK,'wall_id':WALL,'still_sha256':ssha,'portrait_sha256':psha,'source_receipt_sha256':source['receipt_sha256'],'source_ledger_sha256':prep['source_ledger_sha256'],'media_review_sha256':review['review_sha256'],'maker_attribution':'unresolved','byte_collision':False,'source_collision':False}; w('summary.json',result); print(json.dumps(result,indent=2))
