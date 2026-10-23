#!/usr/bin/env python3
"""Bounded estate photo work. Collection/processing propose; named reviewers decide.

No local inference, scheduler, credentials, roster growth, or automatic publication.
Run `python scripts/photo-maintenance.py --help`. Pillow is only needed for images.
"""
from __future__ import annotations
import argparse, concurrent.futures, contextlib, copy, datetime as dt, hashlib, html
import io, json, os, re, shutil, socket, sqlite3, subprocess, sys, time
import urllib.parse as up, urllib.request as ur, urllib.error as ue, ipaddress
from pathlib import Path

SIDES = ('still', 'portrait')
WP = 'https://en.wikipedia.org/w/api.php'
CO = 'https://commons.wikimedia.org/w/api.php'
UA = 'UnderCast-photo-maintenance/1.0 (+https://github.com/BigBirdReturns/undercast)'
DIGEST = re.compile(r'^[a-f0-9]{64}$')
ROOT = Path(__file__).resolve().parent.parent

def sha(b): return hashlib.sha256(b).hexdigest()
def stable(v): return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
def fingerprint(v): return sha(stable(v).encode())
def read(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def write(p, v):
    p = Path(p); p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + f'.{os.getpid()}.tmp')
    tmp.write_text(json.dumps(v, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'); tmp.replace(p)
def require(ok, message):
    if not ok: raise ValueError(message)
def inside(root, relative):
    root = Path(root).resolve(); p = root / relative
    require(not Path(relative).is_absolute() and '\\' not in str(relative) and '..' not in Path(relative).parts, 'unsafe relative path')
    require(p.resolve().is_relative_to(root), 'path escapes root')
    for ancestor in [p, *p.parents]:
        if ancestor == root: break
        require(not ancestor.is_symlink(), 'symlink refused: ' + str(ancestor))
    return p

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True, stderr=subprocess.PIPE).strip()
def run_node(root, *args, payload=None):
    r = subprocess.run(['node', str(Path(root)/'scripts/photo-review.mjs'), *args], input=None if payload is None else stable(payload), capture_output=True, text=True, cwd=root)
    require(r.returncode == 0, r.stderr or r.stdout or 'photo review bridge failed')
    return json.loads(r.stdout)
def stamp(): return dt.datetime.now(dt.timezone.utc).isoformat()
def plain(s): return html.unescape(re.sub(r'<[^>]*>', '', str(s or ''))).strip()
def document_text(value):
    if isinstance(value, dict): return '\n'.join(document_text(v) for v in value.values())
    if isinstance(value, list): return '\n'.join(document_text(v) for v in value)
    return plain(value) if isinstance(value, str) else ''
def page_title(url):
    u = up.urlsplit(url or '')
    return up.unquote(u.path.split('/wiki/', 1)[1]).replace('_', ' ') if '/wiki/' in u.path else None

def api_for(url):
    h = up.urlsplit(url or '').hostname or ''
    if h in ['en.wikipedia.org', 'commons.wikimedia.org', 'wikizilla.org']: return 'https://' + h + '/w/api.php'
    if h.endswith('.fandom.com'): return 'https://' + h + '/api.php'
    return None

def safe_url(url, allowed):
    u = up.urlsplit(url)
    require(u.scheme == 'https' and not u.username and not u.password and u.port in [None,443], 'only public HTTPS sources are allowed')
    require(u.hostname in allowed, 'source host outside configured public sources: ' + str(u.hostname))
    for row in socket.getaddrinfo(u.hostname, 443, type=socket.SOCK_STREAM):
        require(ipaddress.ip_address(row[4][0]).is_global, 'non-public source address refused')
    return url

class Redirect(ur.HTTPRedirectHandler):
    def __init__(self, allowed): super().__init__(); self.allowed = allowed
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_url(newurl, self.allowed)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

class Cache:
    """Content-addressed bytes, validated readback, shared per-host pacing via SQLite.

    Multiple workers may share a cache. SQLite locks only rate reservations, never
    image review. Failure entries expire; successful snapshots are explicit retained
    inputs. --refresh retrieves a new snapshot, --offline performs zero requests.
    """
    def __init__(self, directory, allowed, offline=False, refresh=False, budget=120):
        self.path = Path(directory).resolve(); self.path.mkdir(parents=True, exist_ok=True)
        self.allowed = set(allowed); self.offline=offline; self.refresh=refresh; self.budget=budget
        self.stats={'network_requests':0, 'cache_hits':0, 'failed_requests':0}
        import threading
        self.lock=threading.Lock(); self.opener=ur.build_opener(Redirect(allowed))
        with sqlite3.connect(self.path/'requests.sqlite', timeout=30) as c:
            c.execute('CREATE TABLE IF NOT EXISTS rate(host TEXT PRIMARY KEY, next REAL)')
    def pace(self, host, backoff=1.0):
        with sqlite3.connect(self.path/'requests.sqlite', timeout=60) as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT next FROM rate WHERE host=?',(host,)).fetchone()
            when=max(time.time(), row[0] if row else 0)
            c.execute('INSERT OR REPLACE INTO rate VALUES (?,?)',(host,when+backoff))
        time.sleep(max(0, when-time.time()))
    def get(self, url, limit=25*1024*1024):
        # The allowlist is checked even on cache hits. Offline replay needs no DNS.
        u=up.urlsplit(url)
        require(u.scheme=='https' and u.hostname in self.allowed and not u.username and not u.password and u.port in [None,443], 'source URL outside allowlist')
        key=sha(url.encode()); meta_path=self.path/'requests'/(key+'.json')
        if meta_path.exists() and (self.offline or not self.refresh):
            meta=read(meta_path)
            require(meta.get('url')==url,'cache URL binding changed')
            if meta.get('failure'):
                if self.offline or time.time()-meta['at_unix']<3600: raise RuntimeError(meta['failure'])
            else:
                b=inside(self.path,meta['body']).read_bytes()
                require(len(b)==meta['bytes'] and sha(b)==meta['sha256'], 'corrupt cached source: '+url)
                with self.lock: self.stats['cache_hits']+=1
                return b,meta
        require(not self.offline, 'offline cache miss: '+url)
        safe_url(url,self.allowed)
        last_error="upstream request failed"
        for attempt in range(3):
            self.pace(u.hostname)
            with self.lock:
                require(self.stats['network_requests']<self.budget, 'bounded network request budget exhausted')
                self.stats['network_requests']+=1
            try:
                with self.opener.open(ur.Request(url,headers={'User-Agent':UA}),timeout=25) as response:
                    b=response.read(limit+1); require(len(b)<=limit,'source exceeds bounded download size')
                    mime=response.headers.get('Content-Type',''); delivered=response.url
                digest=sha(b); relative='blobs/'+digest
                dest=inside(self.path,relative); dest.parent.mkdir(exist_ok=True)
                if not dest.exists():
                    temp=dest.with_name(dest.name+f'.{os.getpid()}.{time.time_ns()}.tmp'); temp.write_bytes(b); temp.replace(dest)
                require(sha(dest.read_bytes())==digest,'cached byte collision')
                meta={'url':url,'delivered_url':delivered,'retrieved_at':stamp(),'at_unix':time.time(),'sha256':digest,'bytes':len(b),'mime':mime,'body':relative}
                write(meta_path,meta); return b,meta
            except (ue.HTTPError,ue.URLError,TimeoutError,ValueError) as e:
                last_error=str(e)
                if isinstance(e,ue.HTTPError) and e.code in [429,503] and attempt<2:
                    value=e.headers.get('Retry-After','5')
                    wait=float(value) if value.isdigit() else 10
                    if wait>60: break
                    self.pace(u.hostname,max(1,wait)); continue
                if isinstance(e,ue.HTTPError) and e.code in [401,403,404]: break
                if attempt<2: time.sleep(1+attempt); continue
                break
        failure=last_error
        write(meta_path,{'url':url,'failure':failure,'at_unix':time.time(),'retrieved_at':stamp()})
        with self.lock: self.stats['failed_requests']+=1
        raise RuntimeError(failure)
    def page(self, api, title, files=False):
        p={'action':'query','format':'json','formatversion':'2','maxlag':'5','redirects':'1','titles':title,'prop':'revisions|imageinfo' if files else 'revisions|pageimages|images|pageprops','rvprop':'ids|timestamp|content','rvslots':'main'}
        if files:p.update(iiprop='url|size|sha1|extmetadata')
        else:p.update(piprop='name|original',pilicense='any',imlimit='12')
        url=api+'?'+up.urlencode(sorted(p.items())); b,meta=self.get(url,12*1024*1024)
        doc=json.loads(b); require('error' not in doc,'source API returned an error')
        pages=doc.get('query',{}).get('pages',[]); require(pages,'source returned no page')
        page=pages[0]; require(not page.get('missing') or page.get('imageinfo'),'source page absent: '+title)
        return page,meta,b

def memberships(row, canon):
    label=canon['label'].casefold(); production=str(row.get('production','')).casefold()
    if row.get('universe','').casefold()==label or label in production:return True
    urls=[x.get('source','') for x in row.get('references',[])]
    urls += [(row.get(s)or{}).get('origin','') for s in SIDES]
    return any(up.urlsplit(url).hostname in canon['source_hosts'] for url in urls)

def plan(args):
    root=args.root.resolve(); records=read(args.records or root/'data/specimens.json')
    require(isinstance(records,list),'records must be an array')
    registry=read(root/'data/ESTATE-REGISTRY.json')['estates']
    canon=next((c for c in registry if c['id']==args.canon),None) if args.canon else None
    require(not args.canon or canon,'canon must be registered as inventory or better; registration is not certification')
    ids=set(args.ids.split(',')) if args.ids else None
    require(canon or ids,'choose --canon or explicit --ids')
    if ids: require(ids <= {r['id'] for r in records},'unknown requested record ID')
    rows=[r for r in records if (not canon or memberships(r,canon)) and (not ids or r['id'] in ids)]
    require(rows,'empty selected population'); require(1<=args.limit<=64,'batch limit must be 1..64 records')
    audit={(r['wall_id'],r['side']):r for r in read(root/'data/MEDIA-AUDIT.json')['items']}
    rows.sort(key=lambda r:(sum(bool(r.get(s)) for s in SIDES),r['id']))
    facets=[]; selected=[]
    for r in rows:
        sides=[s for s in SIDES if args.side in ['both',s] and (args.refresh or not r.get(s) or audit.get((r['id'],s),{}).get('status')!='verified')]
        if not sides:continue
        if len(selected)>=args.limit:break
        selected.append(r)
        for side in sides:
            a=r.get(side); digest=None
            if a:
                local=inside(root,a['src'])
                if local.exists():digest=sha(local.read_bytes())
                else:digest=audit.get((r['id'],side),{}).get('asset',{}).get('sha256')
                require(digest,'current media lacks immutable hash')
            facets.append({'id':r['id'],'side':side,'record_sha256':fingerprint(r),'before':a,'before_sha256':digest})
    allowed={'en.wikipedia.org','commons.wikimedia.org','upload.wikimedia.org','static.wikia.nocookie.net','images.wikia.nocookie.net'}
    allowed.update(h for c in registry for h in c['source_hosts'])
    body={'version':1,'base_commit':git(root,'rev-parse','HEAD'),'canon':args.canon,'source_hosts':canon['source_hosts'] if canon else [],'allowed_hosts':sorted(allowed),'records':selected,'facets':facets,'max_candidates':args.max_candidates,'source_hints':read(args.sources) if args.sources else []}
    require(1<=args.max_candidates<=6,'max candidates must be 1..6')
    body['run_id']=fingerprint(body)[:20]; out=args.run.resolve(); require(not out.is_relative_to(root),'run directory must be outside checkout')
    if (out/'plan.json').exists():require(read(out/'plan.json')==body,'run already belongs to another input snapshot; choose a new run directory')
    else:write(out/'plan.json',body)
    print(stable({'run_id':body['run_id'],'records':len(selected),'facets':len(facets),'canonical_writes':0}))

def save_document(run, page, meta, raw):
    relative='documents/'+meta['sha256']+'.json'; p=inside(run,relative);p.parent.mkdir(exist_ok=True);p.write_bytes(raw)
    return {'path':relative,'sha256':meta['sha256'],'url':meta['url'],'retrieved_at':meta['retrieved_at'],'pageid':page.get('pageid'),'title':page.get('title'),'revisions':[{'revid':r.get('revid'),'timestamp':r.get('timestamp')} for r in page.get('revisions',[])],'text':document_text(page)}

def collect(args):
    from PIL import Image,ImageOps
    root=args.root.resolve(); run=args.run.resolve(); p=read(run/'plan.json')
    cache=Cache(args.cache,p['allowed_hosts'],args.offline,args.refresh,args.budget)
    candidates=[]; outcomes=[]; records={r['id']:r for r in p['records']}
    for facet in p['facets']:
        row=records[facet['id']]; side=facet['side']; requests=[]; errors=[]; pool=[]; docs=[]
        for hint in p.get('source_hints',[]):
            if hint.get('id')==row['id'] and hint.get('side')==side:
                for url in hint.get('urls',[]):
                    require(up.urlsplit(url).hostname in p['allowed_hosts'] and api_for(url) and page_title(url), 'source hint outside configured wiki sources')
                    requests.append((api_for(url),page_title(url)))
        old=row.get(side) or {}; origin=old.get('origin',''); api=api_for(origin); title=page_title(origin)
        if api and title:requests.append((api,title))
        if side=='portrait':
            actor_title=page_title(row.get('link','')) if up.urlsplit(row.get('link','')).hostname=='en.wikipedia.org' else row['actor']
            requests.append((WP,actor_title))
            # Franchise performer pages are independent candidates, not automatic identity proof.
            hosts=p['source_hosts'] or list(dict.fromkeys(up.urlsplit(x.get('source','')).hostname for x in row.get('references',[]) if x.get('claim')=='performance'))
            for host in hosts:
                if host and host.endswith('.fandom.com'):requests.append(('https://'+host+'/api.php',row['actor']))
        else:
            for ref in row.get('references',[]):
                if ref.get('claim') not in ['performance','production']:continue
                api=api_for(ref.get('source','')); title=page_title(ref.get('source',''))
                if api and title:requests.append((api,title))
            for host in p['source_hosts']:
                if host.endswith('.fandom.com'):requests.append(('https://'+host+'/api.php',row['character']))
        for api,title in list(dict.fromkeys(requests))[:4]:
            try:
                page,meta,raw=cache.page(api,title,title.startswith('File:')); doc=save_document(run,page,meta,raw);docs.append(doc)
                if page.get('imageinfo'):pool.append((api,page['title'],doc))
                names=[page.get('pageimage','')]
                text=document_text(page)
                names += re.findall(r'^\|\s*image\d*\s*=\s*([^\n|{}]+\.(?:jpe?g|png|webp|gif))',text,re.I|re.M)
                names += [x['title'] for x in page.get('images',[])]
                for name in dict.fromkeys(names):
                    if re.search(r'\.(?:jpe?g|png|webp|gif)$',name,re.I) and not re.search(r'(?:logo|signature|flag_of|icon)',name,re.I):pool.append((api,'File:'+name.strip().removeprefix('[[File:').removeprefix('File:'),doc))
            except (ValueError,RuntimeError,ue.URLError,OSError) as e: errors.append({'api':api,'title':title,'error':str(e)})
        seen=set(); accepted=[]
        for api,title,parent_doc in pool:
            if len(accepted)>=p['max_candidates']:break
            if (api,title) in seen:continue
            seen.add((api,title))
            try:
                page,meta,raw=cache.page(api,title,True)
                if page.get('imagerepository')=='shared':page,meta,raw=cache.page(CO,title,True)
                ii=(page.get('imageinfo')or[{}])[0];require(ii.get('url') and ii.get('descriptionurl'),'file has no exact image URL or file-page locator')
                fdoc=save_document(run,page,meta,raw); body,receipt=cache.get(ii['url'])
                im=Image.open(io.BytesIO(body)); require(getattr(im,'n_frames',1)==1,'animated source needs an explicitly reviewed frame'); im.verify(); im=ImageOps.exif_transpose(Image.open(io.BytesIO(body)))
                ext={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp','GIF':'.gif'}.get(Image.open(io.BytesIO(body)).format)
                require(ext,'unsupported source image format');require(im.width>=48 and im.height>=48,'source below minimum legibility floor')
                digest=sha(body); relative='originals/'+digest+ext; dest=inside(run,relative);dest.parent.mkdir(exist_ok=True);dest.write_bytes(body)
                em=ii.get('extmetadata')or{}
                item={**facet,'actor':row['actor'],'character':row['character'],'production':row.get('production'),'origin':ii['descriptionurl'],'source_path':relative,'source_sha256':digest,'source_dimensions':list(im.size),'source_receipt':receipt,'upstream_sha1':ii.get('sha1'),'delivered_sha1':hashlib.sha1(body).hexdigest(),'author':plain(em.get('Artist',{}).get('value','')),'license':plain(em.get('LicenseShortName',{}).get('value','')),'documents':[parent_doc] if parent_doc['sha256']==fdoc['sha256'] else [parent_doc,fdoc]}
                item['candidate_key']=fingerprint({k:item[k] for k in ['id','side','record_sha256','source_sha256','origin']})
                denial=run_node(root,'classify',payload={'root':str(root),'candidates':[item]})[0]
                if denial.get('rejection'):errors.append({'origin':item['origin'],'rejection':denial['rejection']});continue
                if not any(c['candidate_key']==item['candidate_key'] for c in accepted):accepted.append(item)
            except (ValueError,RuntimeError,ue.URLError,OSError) as e:errors.append({'api':api,'file':title,'error':str(e)})
        candidates+=accepted;outcomes.append({'id':row['id'],'side':side,'candidates':len(accepted),'errors':errors})
        print(stable({'id':row['id'],'side':side,'candidates':len(accepted)}),flush=True)
    result={'version':1,'run_id':p['run_id'],'candidates':candidates,'outcomes':outcomes};write(run/'candidates.json',result)
    decisions={'version':1,'run_id':p['run_id'],'reviewer':'','reviewer_kind':'agent','selections':[{**f,'action':'pending','candidate_key':None,'evidence':[],'reason':'','fit':'contain','focus':{'x':'center','y':'center'},'crop_box_px':None} for f in p['facets']]}
    if not (run/'source-review.json').exists():write(run/'source-review.json',decisions)
    gallery(root,run,result['candidates'],'candidates.html',prepared=False)
    write(run/'collection-stats.json',cache.stats); print(stable({**cache.stats,'run_id':p['run_id'],'candidates':len(candidates),'canonical_writes':0}))

def gallery(root,run,rows,name,prepared):
    from PIL import Image,ImageOps
    def thumb(relative, source):
        source=Path(source);dest=inside(run,relative);dest.parent.mkdir(exist_ok=True)
        im=ImageOps.exif_transpose(Image.open(source)).convert('RGB');im.thumbnail((640,640));im.save(dest,'JPEG',quality=88);return relative
    cards=[]
    for row in rows:
        rid,side=row['id'],row['side']; current=row.get('before'); before=''; proposed=''
        if current:
            src=inside(root,current['src'])
            if src.exists():before=thumb('previews/'+sha(src.read_bytes())+'.jpg',src)
        source=inside(run,row['display_path'] if prepared else row['source_path'])
        proposed=thumb('previews/'+sha(source.read_bytes())+'.jpg',source)
        pos=lambda a: ' '.join(str((a.get('focus')or{}).get(k,default))+'%' if isinstance((a.get('focus')or{}).get(k,default),int) else {'top':'0%','upper':'25%','center':'50%','lower':'75%','bottom':'100%','left':'0%','right':'100%'}.get(str((a.get('focus')or{}).get(k,default)),'50%') for k,default in [('x','center'),('y','upper')])
        def plate(src,asset,label):
            if not src:return '<figure><div class="frame empty">Not on file</div><figcaption>'+label+'</figcaption></figure>'
            a=asset or {};fit=a.get('fit','cover');return f'<figure><div class="frame"><img src="{html.escape(src,quote=True)}" style="object-fit:{fit};object-position:{pos(a)}" alt="{html.escape(label,quote=True)}"></div><figcaption>{label}</figcaption></figure>'
        details=html.escape(row.get('candidate_key',''))
        origin=row.get('origin') or row['after']['origin'];title=f'{rid} / {side}'
        proposed_asset=row.get('after') if prepared else {'fit':'contain'}
        cards.append(f'<article><h2>{html.escape(title)}</h2><p>{html.escape(row.get("actor", ""))} · {html.escape(row.get("character", ""))}</p><div class="pair">'+plate(before,current,'Current')+plate(proposed,proposed_asset,'Prepared' if prepared else 'Source candidate')+f'</div><a href="{html.escape(origin,quote=True)}">Exact source</a><details><summary>Source evidence and candidate key</summary><code>{details}</code><pre>{html.escape(chr(10).join(d["text"] for d in row.get("documents",[])))}</pre></details></article>')
    body='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>UnderCast photo review</title><style>body{font:16px system-ui;background:#e4dfd5;color:#1c1a16;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,500px),1fr));gap:24px}article{border:1px solid #aaa;padding:16px;min-width:0}h2{font-size:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0;min-width:0}.frame{position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;background:#211f1b}.frame img{position:absolute;inset:0;width:100%;height:100%;max-width:none}.empty{color:#fff;display:grid;place-items:center}#tall:checked~main .frame{aspect-ratio:4/5}pre,code{white-space:pre-wrap;overflow-wrap:anywhere}figcaption{padding:6px}details{margin-top:12px}a{color:#465d59}</style><h1>Source and display review</h1><p>Candidate work, not a verification certificate. Exact source text establishes identity; these images support composition review.</p><input id="tall" type="checkbox"><label for="tall"> Tall permanent-record frame (4:5)</label><main>'''+''.join(cards)+'</main>'
    (run/name).write_text(body,encoding='utf-8')

def selected_inputs(root,run):
    p=read(run/'plan.json');review=read(run/'source-review.json');candidates=read(run/'candidates.json')['candidates']
    require(review['run_id']==p['run_id'] and review.get('reviewer_kind')=='agent' and len(review.get('reviewer','').strip())>=3,'explicit agent reviewer required')
    bykey={r['candidate_key']:r for r in candidates};facets={(r['id'],r['side']):r for r in p['facets']};selections=review['selections']
    require(len(selections)==len(facets) and {(r['id'],r['side']) for r in selections}==set(facets),'review must account for every planned side exactly once')
    accepted=[]
    for s in selections:
        require(s['action'] in ['select','keep','defer','reject'],'pending source review must be resolved')
        require(len(s.get('reason','').strip())>=12,'review rationale required')
        if s['action']!='select':continue
        c=bykey.get(s.get('candidate_key'));require(c is not None,'unknown selected candidate')
        require((s['id'],s['side'])==(c['id'],c['side']),'selected candidate belongs to another side')
        require(c['record_sha256']==facets[(s['id'],s['side'])]['record_sha256'],'stale candidate binding')
        require(sha(inside(run,c['source_path']).read_bytes())==c['source_sha256'],'source bytes changed')
        require(s.get('evidence'),'documentary identity evidence required')
        for evidence in s['evidence']:
            d=next((x for x in c['documents'] if x['sha256']==evidence.get('document_sha256')),None)
            require(d is not None,'evidence must name an acquired source snapshot')
            raw=inside(run,d['path']).read_bytes();require(sha(raw)==d['sha256'],'source document bytes changed')
            quote=evidence.get('quote','');require(len(quote)>=12 and quote in d['text'],'evidence quote missing from source page')
        require(s.get('fit') in ['cover','contain'],'invalid display fit')
        accepted.append((c,s))
    denials=run_node(root,'classify',payload={'root':str(root),'candidates':[c for c,s in accepted]})
    require(all(not d.get('rejection') for d in denials),'selected source is in the rejection registry')
    return p,review,accepted

def prepare(args):
    from PIL import Image,ImageOps,__version__ as pillow_version
    from photo_pixels import replay
    root=args.root.resolve(); run=args.run.resolve();p,review,selected=selected_inputs(root,run);out=[]
    for c,s in selected:
        raw=inside(run,c['source_path']).read_bytes();im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
        box=s.get('crop_box_px');ops=[]
        if box:
            require(len(box)==4 and all(type(n)is int for n in box) and 0<=box[0]<box[2]<=im.width and 0<=box[1]<box[3]<=im.height,'invalid crop bounds')
            ops.append({'operation':'crop','box_px':box});im=im.crop(box)
        if Path(c['source_path']).suffix in ['.png','.webp'] and im.mode in ['RGBA','LA','P'] and not box:
            ops=[{'operation':'identity-copy'}]
        else:
            if max(im.size)>1200:
                factor=1200/max(im.size);size=[round(im.width*factor),round(im.height*factor)];ops.append({'operation':'lanczos-resize','size':size,'synthetic_detail':False})
            ops.append({'operation':'jpeg-encode','quality':92,'subsampling':0})
        display=replay(raw,ops);ext=Path(c['source_path']).suffix if ops==[{'operation':'identity-copy'}] else '.jpg'
        digest=sha(display);relative='display/photo-'+digest[:16]+ext;dest=inside(run,relative);dest.parent.mkdir(exist_ok=True);dest.write_bytes(display)
        author=c['author'];license=c['license'];free=bool(re.search(r'cc[- ]?by|cc0|public domain',license,re.I))
        require(not (c['side']=='portrait' and free) or author,'attributed portrait needs a source-declared author; do not invent one')
        asset={'src':'images/'+dest.name,'kind':'still' if c['side']=='still' else ('free' if free else 'copyright'),'origin':c['origin'],'pin':True,'fit':s['fit'],'focus':s.get('focus',{'x':'center','y':'center'}),'processing':'Source image: '+(', '.join({'crop':'crop','lanczos-resize':'Lanczos resize','identity-copy':'unchanged original bytes','jpeg-encode':'display encoding'}[op['operation']] for op in ops))+'. No generated detail.'}
        if c['side']=='portrait' or author:asset['author']=author
        if c['side']=='portrait' or license:asset['license']=license or 'Copyright; source attribution retained'
        out.append({**c,'after':asset,'operations':ops,'recipe_sha256':fingerprint(ops),'display_path':relative,'display_sha256':digest,'display_dimensions':list(Image.open(io.BytesIO(display)).size),'source_review':s,'reviewer_kind':'agent'})
    prepared={'version':1,'run_id':p['run_id'],'source_review_sha256':sha((run/'source-review.json').read_bytes().replace(b'\r\n',b'\n')),'pillow_version':pillow_version,'changes':out};write(run/'prepared.json',prepared)
    expected={'version':1,'run_id':p['run_id'],'prepared_sha256':sha((run/'prepared.json').read_bytes().replace(b'\r\n',b'\n')),'reviewer':'','reviewer_kind':'agent','decisions':[{'candidate_key':c['candidate_key'],'display_sha256':c['display_sha256'],'recipe_sha256':c['recipe_sha256'],'decision':'pending','note':''}for c in out]}
    if (run/'display-review.json').exists():require(read(run/'display-review.json')['prepared_sha256']==expected['prepared_sha256'],'prepared output changed; retain old display review separately and review new bytes')
    else:write(run/'display-review.json',expected)
    gallery(root,run,out,'prepared.html',True)
    print(stable({'prepared':len(out),'source_review':review['reviewer'],'canonical_writes':0,'display_review':'required'}))

def main():
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command',choices=['plan','collect','prepare','stage','status'])
    parser.add_argument('--root',type=Path,default=ROOT);parser.add_argument('--run',type=Path,required=True)
    parser.add_argument('--cache',type=Path);parser.add_argument('--canon');parser.add_argument('--ids');parser.add_argument('--records',type=Path)
    parser.add_argument('--sources',type=Path,help='Reviewed exact source-page hints, an array of {id,side,urls}')
    parser.add_argument('--side',choices=['still','portrait','both'],default='both');parser.add_argument('--limit',type=int,default=16)
    parser.add_argument('--max-candidates',type=int,default=3);parser.add_argument('--budget',type=int,default=120)
    parser.add_argument('--offline',action='store_true');parser.add_argument('--refresh',action='store_true')
    args=parser.parse_args()
    if args.command=='plan':plan(args)
    elif args.command=='collect':
        require(args.cache is not None,'--cache required for shared retained source reuse');collect(args)
    elif args.command=='prepare':prepare(args)
    elif args.command=='stage':
        os.environ.setdefault('PHOTO_PYTHON',sys.executable)
        selected_inputs(args.root.resolve(),args.run.resolve())
        print(stable(run_node(args.root,'stage','--run',str(args.run.resolve()),'--root',str(args.root.resolve()))))
    else:
        p=read(args.run/'plan.json');print(stable({'run_id':p['run_id'],'records':len(p['records']),'facets':len(p['facets']),'collected':(args.run/'candidates.json').exists(),'prepared':(args.run/'prepared.json').exists(),'staged':(args.run/'staged.json').exists()}))
if __name__=='__main__':
    try:main()
    except Exception as e:print('photo-maintenance: '+str(e),file=sys.stderr);sys.exit(1)
