#!/usr/bin/env python3
"""Reproduce retained photo bytes without retrieval, inference or approval."""
import argparse,hashlib,json,sys
from pathlib import Path
from photo_pixels import replay

def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--run',type=Path);p.add_argument('--ledger',action='append');a=p.parse_args();root=(a.run or a.root).resolve()
    if a.run:rows=json.loads((root/'prepared.json').read_text())['changes']
    else:
        ledgers=a.ledger or json.loads((root/'data/PHOTO-PREPARATIONS.json').read_text())['ledgers']
        rows=[r for ledger in ledgers for r in json.loads((root/ledger).read_text())['changes']]
    checked=[]
    def local(relative):
        q=root/relative
        if Path(relative).is_absolute() or '..' in Path(relative).parts or not q.resolve().is_relative_to(root):raise ValueError('unsafe retained photo path')
        for ancestor in [q,*q.parents]:
            if ancestor==root:break
            if ancestor.is_symlink():raise ValueError('photo symlink refused')
        return q
    for row in rows:
        if not row.get('after'):continue
        raw=local(row['source_path']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=row['source_sha256']:raise ValueError('source bytes changed')
        output=replay(raw,row['operations'])
        if hashlib.sha256(output).hexdigest()!=row['display_sha256']:raise ValueError(row['id']+' display differs from recipe')
        destination=row['display_path'] if a.run else row['after']['src']
        if local(destination).read_bytes()!=output:raise ValueError(row['id']+' retained display differs')
        checked.append(row['id']+'/'+row['side'])
    print(json.dumps({'pass':True,'replayed':len(checked),'facets':checked,'network_requests':0,'model_calls':0}))
if __name__=='__main__':
    try:main()
    except Exception as e:print('photo replay: '+str(e),file=sys.stderr);sys.exit(1)
