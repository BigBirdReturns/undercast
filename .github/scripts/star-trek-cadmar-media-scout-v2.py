#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,os,subprocess,urllib.parse,urllib.request
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
EXPECTED_MAIN=os.environ['EXPECTED_MAIN']
OUT=Path('/tmp/star-trek-cadmar-media-scout-v2'); OUT.mkdir(parents=True,exist_ok=True)
TITLE='File:Star Trek Cast and Crew Visit NASA Dryden in 1967.jpg'
PAGE='https://commons.wikimedia.org/wiki/File:Star_Trek_Cast_and_Crew_Visit_NASA_Dryden_in_1967.jpg'
q=urllib.parse.urlencode({'action':'query','format':'json','formatversion':2,'redirects':1,'prop':'imageinfo','iiprop':'url|size|sha1|mime|extmetadata','iiurlwidth':1024,'titles':TITLE})
req=urllib.request.Request('https://commons.wikimedia.org/w/api.php?'+q,headers={'User-Agent':'undercast-cadmar-media-scout/2.0'})
with urllib.request.urlopen(req,timeout=120) as r: payload=json.loads(r.read())
page=payload['query']['pages'][0]; info=page['imageinfo'][0]
remote=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0]
if remote!=EXPECTED_MAIN: raise RuntimeError(f'main moved: {remote}')
url=info['thumburl']
req=urllib.request.Request(url,headers={'User-Agent':'undercast-cadmar-media-scout/2.0','Accept':'image/*'})
with urllib.request.urlopen(req,timeout=120) as r: data=r.read()
p=OUT/'dryden-group.jpg'; p.write_bytes(data)
with Image.open(p) as im:
 im=ImageOps.exif_transpose(im).convert('RGB'); im.save(p,quality=95); w,h=im.size
 crops={
  'left-half':(0,0,w//2,h), 'right-half':(w//2,0,w,h),
  'left-third':(0,0,w//3,h), 'middle-third':(w//3,0,2*w//3,h), 'right-third':(2*w//3,0,w,h),
  'center-half':(w//4,0,3*w//4,h),
 }
 rows=[]
 rows.append({'id':'dryden-group','file':p.name,'width':w,'height':h,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'title':TITLE,'page':PAGE,'thumb_url':url,'origin_url':info['url'],'origin_width':info.get('width'),'origin_height':info.get('height'),'origin_size':info.get('size'),'origin_sha1':info.get('sha1'),'author':'NASA','license':'Public domain','nasa_id':'E67-16643-3'})
 for name,box in crops.items():
  cp=OUT/f'{name}.jpg'; crop=im.crop(box); crop.save(cp,quality=95)
  rows.append({'id':name,'file':cp.name,'width':crop.width,'height':crop.height,'sha256':hashlib.sha256(cp.read_bytes()).hexdigest(),'crop_box':box,'derived_from':'dryden-group'})
 tiles=[]
 for row in rows:
  with Image.open(OUT/row['file']) as img: thumb=ImageOps.contain(img.convert('RGB'),(500,500))
  tile=Image.new('RGB',(540,590),'white'); tile.paste(thumb,((540-thumb.width)//2,10+(500-thumb.height)//2)); d=ImageDraw.Draw(tile); d.text((20,530),row['id'],fill='black'); d.text((20,553),f"{row['width']}x{row['height']} {row['sha256'][:12]}",fill='black'); tiles.append(tile)
 cols=3; rows_n=(len(tiles)+cols-1)//cols; sheet=Image.new('RGB',(cols*540,rows_n*590),'#ddd')
 for i,t in enumerate(tiles): sheet.paste(t,((i%cols)*540,(i//cols)*590))
 sheet.save(OUT/'contact-sheet.jpg',quality=93)
(OUT/'manifest.json').write_text(json.dumps({'version':1,'transaction':'STAR-TREK-CADMAR-MEDIA-SCOUT-V2','canonical_parent':EXPECTED_MAIN,'items':rows},indent=2)+'\n')
print(json.dumps(rows,indent=2))
