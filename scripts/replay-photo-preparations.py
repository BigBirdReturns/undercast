#!/usr/bin/env python3
"""Rebuild retained photographic display bytes. No retrieval or model inference."""
import argparse,hashlib,io,json
from pathlib import Path
from PIL import Image,ImageOps

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path.cwd());args=parser.parse_args();root=args.root.resolve()
 ledgers=['data/review/klingon-photo-quality/changes.json','data/review/catalog-photo-quality/changes.json']
 rows=[row for ledger in ledgers for row in json.loads((root/ledger).read_text())['changes']];checked=[]
 for row in rows:
  if not row.get('after'):continue
  raw=(root/row['source_path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==row['source_sha256']
  if row['operations']==[{'operation':'identity-copy'}]:
   assert hashlib.sha256(raw).hexdigest()==row['display_sha256'];assert (root/row['after']['src']).read_bytes()==raw;checked.append(row['id']+'/'+row['side']);continue
  image=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
  for op in row['operations']:
   if op['operation']=='crop':image=image.crop(tuple(op['box_px']))
   elif op['operation']=='lanczos-resize':
    if op.get('method')=='thumbnail':image.thumbnail(tuple(op['bounds']),Image.Resampling.LANCZOS,reducing_gap=op['reducing_gap'])
    else:image=image.resize(tuple(op['size']),Image.Resampling.LANCZOS)
   elif op['operation']=='opencv-fastNlMeansDenoisingColored':
    import cv2,numpy as np
    a=cv2.cvtColor(np.asarray(image),cv2.COLOR_RGB2BGR);a=cv2.fastNlMeansDenoisingColored(a,None,op['h'],op['hColor'],op['templateWindowSize'],op['searchWindowSize']);image=Image.fromarray(cv2.cvtColor(a,cv2.COLOR_BGR2RGB))
   elif op['operation']=='jpeg-encode':
    output=io.BytesIO();image.save(output,'JPEG',quality=op['quality'],subsampling=op['subsampling'],optimize=True)
   else:raise ValueError('unrecognized image operation')
  actual=hashlib.sha256(output.getvalue()).hexdigest();assert actual==row['display_sha256'],row['id']+' derivative differs';assert (root/row['after']['src']).read_bytes()==output.getvalue();checked.append(row['id']+'/'+row['side'])
 print(json.dumps({'pass':True,'replayed':len(checked),'facets':checked,'network_requests':0,'model_calls':0}))
if __name__=='__main__':main()
