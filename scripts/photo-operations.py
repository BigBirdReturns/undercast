#!/usr/bin/env python3
"""Persistent attention and bounded workers for the existing photo workflow.

Run via `npm run photos -- queue ...`. State lives outside Git on one owning
host; estate workers invoke it there over the existing SSH transport. No model
judgment, automatic publication, network filesystem database or daemon.
"""
from __future__ import annotations
import argparse, concurrent.futures, contextlib, hashlib, html, importlib.util
import json, os, secrets, socket, sqlite3, subprocess, sys, threading, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('photo_maintenance', HERE/'photo-maintenance.py')
pm = importlib.util.module_from_spec(spec); spec.loader.exec_module(pm)
STATES = ('idle','queued','collecting','source-review','display-review','ready','applying','staged','published','deferred','unchanged','failed','stale')
ACTIVE = ('collecting','source-review','display-review','ready','applying','staged')
LEASE_SECONDS = 180
POLICY = 'photo-attention-v1'

def emit(value): print(pm.stable(value), flush=True)
def parsed(row):
    if row is None:return None
    d=dict(row)
    for k in ('snapshot','reasons','details'):d[k]=json.loads(d[k])
    return d

class Queue:
    def __init__(self, directory):
        self.path=Path(directory).resolve();self.path.mkdir(parents=True,exist_ok=True)
        self.db=self.path/'attention.sqlite'
        with self.connect() as c:
            c.executescript('''
              CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS jobs(
                key TEXT PRIMARY KEY, record_id TEXT NOT NULL, side TEXT NOT NULL,
                binding TEXT NOT NULL, snapshot TEXT NOT NULL, reasons TEXT NOT NULL,
                priority INTEGER NOT NULL, state TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 1,
                attempts INTEGER NOT NULL DEFAULT 0, token TEXT, lease_until REAL,
                run TEXT, next_at REAL NOT NULL DEFAULT 0, updated REAL NOT NULL,
                details TEXT NOT NULL DEFAULT '{}');
              CREATE TABLE IF NOT EXISTS events(
                seq INTEGER PRIMARY KEY, at REAL NOT NULL,key TEXT NOT NULL,
                operation TEXT NOT NULL, details TEXT NOT NULL);
              CREATE INDEX IF NOT EXISTS due ON jobs(state,next_at,priority);
              CREATE TABLE IF NOT EXISTS candidate_holds(
                key TEXT NOT NULL,subject TEXT NOT NULL,source_hash TEXT NOT NULL,
                origin TEXT NOT NULL,review TEXT NOT NULL,created REAL NOT NULL,
                PRIMARY KEY(key,subject,source_hash,origin));
            ''')
            owner=c.execute("SELECT value FROM meta WHERE key='owner_host'").fetchone()
            pm.require(not owner or owner[0]==socket.gethostname(),'Run this queue on its owning host via SSH; do not share SQLite over SMB/NFS')
            c.execute("INSERT OR IGNORE INTO meta VALUES('owner_host',?)",(socket.gethostname(),))
            c.execute("INSERT OR IGNORE INTO meta VALUES('version','1')")
            pm.require(c.execute("SELECT value FROM meta WHERE key='version'").fetchone()[0]=='1','unsupported queue version')
    def connect(self):
        c=sqlite3.connect(self.db,timeout=30);c.row_factory=sqlite3.Row
        c.execute('PRAGMA busy_timeout=30000');c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA synchronous=FULL')
        return c
    def event(self,c,key,op,value):
        c.execute('INSERT INTO events(at,key,operation,details) VALUES(?,?,?,?)',(time.time(),key,op,pm.stable(value)))
    def get(self,key):
        with self.connect() as c:return parsed(c.execute('SELECT * FROM jobs WHERE key=?',(key,)).fetchone())
    def rows(self):
        with self.connect() as c:return [parsed(r)for r in c.execute('SELECT * FROM jobs ORDER BY priority DESC,key')]
    def sync(self, record, side, asset_hash, reasons, priority):
        key=record['id']+'/'+side; binding=pm.fingerprint({'record':record,'side':side,'asset_sha256':asset_hash,'policy':POLICY})
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');old=parsed(c.execute('SELECT * FROM jobs WHERE key=?',(key,)).fetchone())
            if not old:
                state='queued' if reasons else 'idle'
                c.execute('INSERT INTO jobs(key,record_id,side,binding,snapshot,reasons,priority,state,updated) VALUES(?,?,?,?,?,?,?,?,?)',
                  (key,record['id'],side,binding,pm.stable(record),pm.stable(reasons),priority,state,time.time()))
                self.event(c,key,'discovered',{'state':state,'binding':binding,'reasons':reasons});return state
            if old['binding']!=binding:
                # A queued operation cannot silently rebase its approved record.
                if old['state'] in ACTIVE:
                    c.execute("UPDATE jobs SET state='stale',token=NULL,lease_until=NULL,updated=? WHERE key=?",(time.time(),key))
                    self.event(c,key,'stale',{'old_binding':old['binding'],'new_binding':binding});return 'stale'
                state='queued' if reasons else 'idle'
                c.execute('UPDATE jobs SET binding=?,snapshot=?,reasons=?,priority=?,state=?,generation=generation+1,run=NULL,token=NULL,lease_until=NULL,next_at=0,updated=?,details=? WHERE key=?',
                  (binding,pm.stable(record),pm.stable(reasons),priority,state,time.time(),pm.stable({**{k:v for k,v in old['details'].items()if k in ('feedback','source_hints','html_hints')},'superseded_run':old['run']}),key))
                self.event(c,key,'source-changed',{'binding':binding,'state':state});return state
            # Rescanning never erases operator feedback, retries, or review state.
            combined=list(dict.fromkeys(old['reasons']+reasons))
            state='queued' if old['state']=='idle' and reasons else old['state']
            c.execute('UPDATE jobs SET reasons=?,priority=?,state=? WHERE key=?',(pm.stable(combined),max(priority,old['priority']),state,key))
            if state!=old['state']:self.event(c,key,'new-attention',{'reasons':reasons})
            return state
    def flag(self,key,note,priority=1000):
        pm.require(len(note.strip())>=12,'a specific reason is required')
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');r=parsed(c.execute('SELECT * FROM jobs WHERE key=?',(key,)).fetchone());pm.require(r,'scan this exact record first')
            pm.require(r['state'] not in ('collecting','applying','staged'),'active writer or unpublished staged result owns this task')
            details=r['details'];details.setdefault('feedback',[]).append({'note':note,'at':pm.stamp()})
            c.execute("UPDATE jobs SET state='queued',generation=generation+1,run=NULL,next_at=0,priority=?,details=?,updated=? WHERE key=?",(priority,pm.stable(details),time.time(),key))
            self.event(c,key,'flagged',{'note':note,'priority':priority})
    def claim(self, key=None):
        now=time.time()
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            expired=c.execute("SELECT key FROM jobs WHERE state='collecting' AND lease_until<?",(now,)).fetchall()
            for r in expired:
                c.execute("UPDATE jobs SET state='queued',token=NULL,lease_until=NULL WHERE key=?",(r['key'],));self.event(c,r['key'],'lease-expired',{})
            query="SELECT * FROM jobs WHERE state IN ('queued','failed','deferred') AND next_at<=?";params=[now]
            if key:query+=' AND key=?';params.append(key)
            r=parsed(c.execute(query+' ORDER BY priority DESC,key LIMIT 1',params).fetchone())
            if not r:return None
            token=secrets.token_hex(16);attempt=r['attempts']+1
            rel=f"runs/{r['record_id']}-{r['side']}-g{r['generation']}-a{attempt}"
            c.execute("UPDATE jobs SET state='collecting',token=?,lease_until=?,attempts=?,run=?,updated=? WHERE key=?",(token,now+LEASE_SECONDS,attempt,rel,now,r['key']))
            self.event(c,r['key'],'claimed',{'attempt':attempt,'run':rel})
            r.update(token=token,run=rel,attempts=attempt,state='collecting');return r
    def heartbeat(self,key,token):
        with self.connect() as c:
            return c.execute("UPDATE jobs SET lease_until=? WHERE key=? AND token=? AND state='collecting'",(time.time()+LEASE_SECONDS,key,token)).rowcount==1
    def transition(self,key,expected,state,details=None,token=None,next_at=0,binding=None,snapshot=None):
        pm.require(state in STATES,'unknown state')
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');r=parsed(c.execute('SELECT * FROM jobs WHERE key=?',(key,)).fetchone())
            pm.require(r and r['state'] in expected,'state changed; inspect before retrying')
            if token:pm.require(r['token']==token,'stale worker token')
            value={**r['details'],**(details or {})}
            c.execute('UPDATE jobs SET state=?,details=?,token=NULL,lease_until=NULL,next_at=?,updated=?,binding=?,snapshot=? WHERE key=?',
              (state,pm.stable(value),next_at,time.time(),binding or r['binding'],pm.stable(snapshot) if snapshot else pm.stable(r['snapshot']),key))
            self.event(c,key,state,details or {})
    def hold_candidates(self,job,run,source):
        pool={r['candidate_key']:r for r in pm.read(run/'candidates.json')['candidates']}
        for hold in source.get('candidate_holds',[]):
            row=pool.get(hold.get('candidate_key'));pm.require(row,'held candidate is not part of this run')
            pm.require(len(hold.get('reason','').strip())>=12,'specific candidate hold reason required')
            evidence=hold.get('evidence',[]);pm.require(evidence,'candidate hold needs documentary or display evidence')
            for e in evidence:
                doc=next((d for d in row['documents']if d['sha256']==e.get('document_sha256')),None);pm.require(doc,'unknown hold document')
                raw=pm.inside(run,doc['path']).read_bytes();pm.require(pm.sha(raw)==doc['sha256'],'hold evidence bytes changed')
                pm.require(len(e.get('quote',''))>=12 and e['quote']in pm.document_text(json.loads(raw)),'hold quote absent from retained evidence')
            subject=job['snapshot']['actor']if job['side']=='portrait'else job['snapshot']['character']
            with self.connect()as c:
                review={**hold,'reviewer':source['reviewer'],'reviewer_kind':'agent','run':job['run']}
                c.execute('INSERT OR IGNORE INTO candidate_holds VALUES(?,?,?,?,?,?)',(job['key'],subject,row['source_sha256'],row['origin'],pm.stable(review),time.time()))
                self.event(c,job['key'],'candidate-held',review)
    def held(self,job,row):
        subject=job['snapshot']['actor']if job['side']=='portrait'else job['snapshot']['character']
        with self.connect()as c:return c.execute('SELECT review FROM candidate_holds WHERE key=? AND subject=? AND source_hash=? AND origin=?',(job['key'],subject,row['source_sha256'],row['origin'])).fetchone()
    def summary(self):
        with self.connect() as c:
            counts={r[0]:r[1]for r in c.execute('SELECT state,count(*) FROM jobs GROUP BY state')}
            return {'owner_host':socket.gethostname(),'facets':sum(counts.values()),'states':counts,'events':c.execute('SELECT count(*) FROM events').fetchone()[0],'database':str(self.db),'model_calls':0}
    def export(self):
        # Portable checkpoint, plus an online SQLite backup preserving transactions.
        with self.connect() as c:holds=[dict(r) for r in c.execute('SELECT * FROM candidate_holds ORDER BY key,source_hash')];events=[dict(r) for r in c.execute('SELECT * FROM events ORDER BY seq')]
        pm.write(self.path/'queue.json',{'version':1,'summary':self.summary(),'jobs':self.rows(),'candidate_holds':holds,'events':events})
        target=self.path/'attention.backup.sqlite'
        with self.connect() as src,sqlite3.connect(target) as dest:src.backup(dest)
        return str(target)

def inventory(args,q):
    records=pm.read(args.root/'data/specimens.json');audit={(i['wall_id'],i['side']):i for i in pm.read(args.root/'data/MEDIA-AUDIT.json')['items']}
    registry=pm.read(args.root/'data/ESTATE-REGISTRY.json')['estates']
    canon=next((x for x in registry if x['id']==args.canon),None) if args.canon else None
    pm.require(not args.canon or canon,'unknown canon')
    ids=set(args.ids.split(','))if args.ids else None
    if ids:pm.require(ids<={r['id']for r in records},'unknown record ID')
    assessed={}
    for ledger in pm.read(args.root/'data/PHOTO-PREPARATIONS.json')['ledgers']:
        for row in pm.read(args.root/ledger)['changes']:
            if row.get('composition'):assessed[(row['id'],row['side'])]=row
    inspected=0;pixels=0
    try:from PIL import Image
    except ImportError:Image=None
    for record in records:
        if ids and record['id'] not in ids:continue
        if canon and not pm.memberships(record,canon):continue
        for side in pm.SIDES:
            if args.side not in ('both',side):continue
            in_progress=q.get(record['id']+'/'+side)
            if in_progress and in_progress['state']=='applying':continue
            asset=record.get(side);a=audit.get((record['id'],side),{});reasons=[];priority=0;h=None
            if not asset:reasons.append('missing-image');priority=80
            else:
                h=(a.get('asset')or{}).get('sha256');p=pm.inside(args.root,asset['src'])
                reviewed=assessed.get((record['id'],side))
                if not reviewed or reviewed.get('after')!=asset:reasons.append('composition-review-unrecorded');priority=max(priority,30)
                if a.get('status')!='verified':reasons.append('unresolved-identity-review');priority=max(priority,70)
                if p.exists():
                    actual=pm.sha(p.read_bytes());pm.require(not h or h==actual,'source hash mismatch: '+str(p));h=actual
                    if Image:
                        with Image.open(p) as im:
                            w,ht=im.size;pixels+=1
                            if min(w,ht)<320:reasons.append('low-resolution');priority=max(priority,60)
                            if asset.get('fit','cover')=='cover':
                                losses=[1-min((w/ht)/ar,ar/(w/ht))for ar in (4/3,4/5)]
                                if max(losses)>.20:reasons.append('frame-crops-over-20-percent');priority=max(priority,55)
                elif not h:reasons.append('missing-local-and-hash');priority=90
            old=q.get(record['id']+'/'+side)
            if old and old['state'] in ('published','unchanged','idle') and time.time()-old['updated']>args.refresh_days*86400:
                reasons.append('periodic-composition-review');priority=max(priority,20)
                q.flag(old['key'],'Periodic composition/source review is due.',priority)
            q.sync(record,side,h,reasons,priority);inspected+=1
    return {'inspected':inspected,'pixel_probes':pixels,'pixel_probe_available':Image is not None,**q.summary()}

def command(root,run,args,timeout=600):
    run.mkdir(parents=True,exist_ok=True)
    p=subprocess.run([sys.executable,str(root/'scripts/photo-maintenance.py'),*args],cwd=root,capture_output=True,text=True,timeout=timeout)
    with (run/'worker.log').open('a')as out:out.write(pm.stable({'at':pm.stamp(),'argv':args,'exit':p.returncode})+'\n'+p.stdout+p.stderr+'\n')
    pm.require(p.returncode==0,(p.stderr or p.stdout)[-2400:]);return p.stdout

def worker(args,q,job):
    run=pm.inside(q.path,job['run']);done=threading.Event();started=time.monotonic()
    def beat():
        while not done.wait(20):
            if not q.heartbeat(job['key'],job['token']):break
    thread=threading.Thread(target=beat,daemon=True);thread.start()
    try:
        records={r['id']:r for r in pm.read(args.root/'data/specimens.json')}
        pm.require(pm.fingerprint(records[job['record_id']])==pm.fingerprint(job['snapshot']),'queued record changed; rescan before collection')
        hints=job['details'].get('source_hints',[])
        html_hints=job['details'].get('html_hints',[])
        hint_args=[]
        if hints or html_hints:pm.write(run/'hints.json',[{'id':job['record_id'],'side':job['side'],'urls':hints,'html':html_hints}]);hint_args=['--sources',str(run/'hints.json')]
        command(args.root,run,['plan','--root',str(args.root),'--ids',job['record_id'],'--side',job['side'],'--limit','1','--refresh','--require-composition','--max-candidates',str(args.max_candidates),'--run',str(run),*hint_args])
        command(args.root,run,['collect','--root',str(args.root),'--run',str(run),'--cache',str(args.cache or q.path/'cache'),'--budget',str(args.budget),*(['--offline']if args.offline else []),*(['--refresh']if args.refresh else [])],args.timeout)
        manifest=pm.read(run/'candidates.json');held=[r for r in manifest['candidates']if q.held(job,r)]
        if held and not args.revisit_held:
            pm.write(run/'previously-held-candidates.json',held)
            manifest['candidates']=[r for r in manifest['candidates']if not q.held(job,r)]
            manifest['previously_held']=len(held);pm.write(run/'candidates.json',manifest)
        command(args.root,run,['variants','--root',str(args.root),'--run',str(run)])
        stats=pm.read(run/'collection-stats.json');candidates=pm.read(run/'candidates.json')
        q.transition(job['key'],('collecting',),'source-review',{'collection':stats,'candidate_count':len(candidates['candidates']),'elapsed_seconds':round(time.monotonic()-started,3)},job['token'])
        return {'task':job['key'],'state':'source-review','candidates':len(candidates['candidates']),**stats}
    except Exception as error:
        delay=min(86400,60*2**min(job['attempts'],10))
        try:q.transition(job['key'],('collecting',),'failed',{'error':str(error),'elapsed_seconds':round(time.monotonic()-started,3)},job['token'],time.time()+delay)
        except ValueError:pass # Expired/stale worker cannot override a newer owner.
        return {'task':job['key'],'state':'failed','error':str(error),'retry_seconds':delay}
    finally:done.set();thread.join(timeout=2)

def work(args,q):
    pm.require(1<=args.jobs<=8 and 1<=args.limit<=64 and 1<=args.max_candidates<=6,'bounded workers: jobs 1..8, limit 1..64, candidates 1..6')
    pm.require(1<=args.budget<=120 and 30<=args.timeout<=1800,'bounded request/time budget required')
    results=[];count=0;running={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs)as pool:
        while count<args.limit or running:
            while count<args.limit and len(running)<args.jobs:
                job=q.claim(args.task)
                if not job:count=args.limit;break
                future=pool.submit(worker,args,q,job);running[future]=job;count+=1
                if args.task:count=args.limit
            if not running:break
            completed,_=concurrent.futures.wait(running,return_when=concurrent.futures.FIRST_COMPLETED)
            for future in completed:
                result=future.result();results.append(result);emit(result);del running[future]
    q.export();return {'processed':len(results),'failed':sum(r['state']=='failed'for r in results),'canonical_writes':0,'model_calls':0,**q.summary()}

def get_run(args,q):
    pm.require(args.task,'--task UC-001/portrait is required');job=q.get(args.task);pm.require(job and job['run'],'task has no collected run')
    return job,pm.inside(q.path,job['run'])

def advance(args,q):
    job,run=get_run(args,q)
    current=next((r for r in pm.read(args.root/'data/specimens.json')if r['id']==job['record_id']),None)
    if current!=job['snapshot']:
        q.transition(job['key'],(job['state'],),'stale',{'reason':'record changed before review advancement'})
        pm.require(False,'record changed; rescan before review advancement')
    if job['state']=='source-review':
        review=pm.read(run/'source-review.json')
        if any(s['action']=='pending'for s in review['selections']):return {'task':job['key'],'state':'source-review','reason':'source judgment still pending'}
        # Reuse the same documentary validations rather than invent queue authority.
        plan,source,selected=pm.selected_inputs(args.root,run)
        q.hold_candidates(job,run,source)
        if not selected:
            state='unchanged' if all(s['action']=='keep'for s in source['selections'])else 'deferred'
            q.transition(job['key'],('source-review',),state,{'source_review_sha256':pm.sha((run/'source-review.json').read_bytes()),'reviewer':source['reviewer']},next_at=time.time()+args.retry_days*86400)
        else:
            command(args.root,run,['prepare','--root',str(args.root),'--run',str(run)])
            command(args.root,run,['variants','--root',str(args.root),'--run',str(run)])
            q.transition(job['key'],('source-review',),'display-review',{'prepared_sha256':pm.sha((run/'prepared.json').read_bytes())})
    elif job['state']=='display-review':
        display=pm.read(run/'display-review.json')
        if any(d['decision']=='pending'for d in display['decisions']):return {'task':job['key'],'state':'display-review','reason':'display judgment still pending'}
        result=pm.run_node(args.root,'validate-run',payload={'root':str(args.root),'run':str(run)})
        q.transition(job['key'],('display-review',),'ready' if result['approved'] else 'deferred',{'approved':result['approved'],'display_review_sha256':pm.sha((run/'display-review.json').read_bytes())},next_at=time.time()+args.retry_days*86400)
    else:pm.require(False,'advance expects source-review or display-review')
    return {'task':job['key'],'state':q.get(job['key'])['state'],'canonical_writes':0}

def apply(args,q):
    job,run=get_run(args,q);pm.require(job['state'] in ('ready','applying'),'exact display approval must precede staging')
    if job['state']=='ready':q.transition(job['key'],('ready',),'applying',{'requested_root':str(args.root)})
    # Existing crash-recoverable stage holds the actual canonical-writer lock.
    command(args.root,run,['stage','--root',str(args.root),'--run',str(run),*(['--recover']if args.recover else [])],args.timeout)
    result=pm.read(run/'staged.json');pm.require(result['state']=='staged-not-published','stage has no validated completion receipt')
    record=next(r for r in pm.read(args.root/'data/specimens.json')if r['id']==job['record_id'])
    asset=record[job['side']];h=pm.sha(pm.inside(args.root,asset['src']).read_bytes())
    binding=pm.fingerprint({'record':record,'side':job['side'],'asset_sha256':h,'policy':POLICY})
    q.transition(job['key'],('applying',),'staged',{'staged':result},binding=binding,snapshot=record)
    return {'task':job['key'],'state':'staged','publication':'requires normal reviewed merge and live acceptance'}

def finish(args,q):
    job,run=get_run(args,q);pm.require(job['state']=='staged','only staged work can be published');pm.require(args.base_url and args.base_url.startswith('https://'),'real public HTTPS URL required')
    p=subprocess.run(['node',str(args.root/'scripts/photo-acceptance.mjs'),'--root',str(args.root),'--run',str(run),'--base-url',args.base_url],cwd=args.root,capture_output=True,text=True,timeout=args.timeout)
    (run/'public-acceptance.log').write_text(p.stdout+p.stderr)
    pm.require(p.returncode==0,(p.stderr or p.stdout)[-2400:]);accept=pm.read(run/'live-acceptance.json')
    pm.require(accept['pass'] and accept['mode']=='real-public-requests' and accept.get('release_stable') and accept.get('release_commit'),'exact stable publication readback required')
    record=next(r for r in pm.read(args.root/'data/specimens.json')if r['id']==job['record_id'])
    asset=record[job['side']];h=pm.sha(pm.inside(args.root,asset['src']).read_bytes())
    binding=pm.fingerprint({'record':record,'side':job['side'],'asset_sha256':h,'policy':POLICY})
    q.transition(job['key'],('staged',),'published',{'acceptance':accept},binding=binding,snapshot=record)
    q.export();return {'task':job['key'],'state':'published','commit':accept['release_commit'],'payload':accept['payload_sha256']}

def desk(q):
    rows=q.rows();counts=q.summary();cards=[]
    for r in rows:
        if r['state']=='idle':continue
        label=html.escape(f"{r['key']} · {r['snapshot']['character']} / {r['snapshot']['actor']}")
        link=''
        if r['run']:
            run=pm.inside(q.path,r['run'])
            for file,name in [('review.html','Review source and crop'),('prepared.html','Prepared comparison')]:
                if (run/file).exists():link+=f'<a href="{html.escape(r["run"]+"/"+file,quote=True)}">{name}</a> '
        cards.append(f'<tr data-state="{r["state"]}"><th>{label}</th><td>{r["state"]}</td><td>{html.escape(", ".join(r["reasons"]))}<br>{html.escape("; ".join(f["note"] for f in r["details"].get("feedback",[])))}</td><td>{link}</td></tr>')
    body='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UnderCast photo attention</title><style>body{background:#e4dfd5;color:#1c1a16;font:16px system-ui;margin:24px}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #aaa;padding:12px;vertical-align:top}a{display:inline-block;margin:4px;color:#345b55}input,select{font:inherit;padding:8px}th{font-weight:500}@media(max-width:650px){tr,td,th{display:block}}[hidden]{display:none}</style><h1>Photographic attention</h1><p>'+html.escape(pm.stable(counts))+'</p><p>Source identity, composition and publication are separate states. Workers stop for judgment; hardware never awards approval.</p><label>Filter <input id="filter" placeholder="record, canon, person or issue"></label> <label>State <select id="state"><option value="">All</option>'+''.join(f'<option>{s}</option>'for s in STATES)+'</select></label><table><tbody>'+''.join(cards)+'</tbody></table><script>function filter(){for(const r of document.querySelectorAll("tbody tr"))r.hidden=!r.textContent.toLowerCase().includes(document.querySelector("#filter").value.toLowerCase())||(document.querySelector("#state").value&&r.dataset.state!==document.querySelector("#state").value)}document.querySelector("#filter").oninput=filter;document.querySelector("#state").onchange=filter;</script>'
    (q.path/'desk.html').write_text(body);q.export();return {'desk':str(q.path/'desk.html'),**counts}

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('operation',choices=['scan','flag','work','advance','apply','finish','retry','import-review','status','desk','export'])
    p.add_argument('--state',type=Path,required=True);p.add_argument('--root',type=Path,default=pm.ROOT)
    p.add_argument('--canon');p.add_argument('--ids');p.add_argument('--side',choices=['still','portrait','both'],default='both');p.add_argument('--task')
    p.add_argument('--html-page');p.add_argument('--image',action='append',default=[]);p.add_argument('--input',type=Path);p.add_argument('--kind',choices=['source','display']);p.add_argument('--reason');p.add_argument('--source',action='append',default=[]);p.add_argument('--priority',type=int,default=1000)
    p.add_argument('--jobs',type=int,default=2);p.add_argument('--limit',type=int,default=8);p.add_argument('--cache',type=Path)
    p.add_argument('--max-candidates',type=int,default=6);p.add_argument('--budget',type=int,default=40);p.add_argument('--timeout',type=int,default=600)
    p.add_argument('--refresh-days',type=int,default=180);p.add_argument('--retry-days',type=int,default=30)
    p.add_argument('--revisit-held',action='store_true',help='Explicitly reopen exact operational candidate holds for review');p.add_argument('--refresh',action='store_true');p.add_argument('--offline',action='store_true');p.add_argument('--recover',action='store_true');p.add_argument('--base-url')
    a=p.parse_args(argv);a.root=a.root.resolve();a.state=a.state.resolve()
    pm.require(not a.state.is_relative_to(a.root),'queue, cache and run state must remain outside the canonical checkout')
    pm.require(a.retry_days>=1 and a.refresh_days>=1,'retry/refresh intervals must be positive')
    q=Queue(a.state)
    if a.operation=='scan':result=inventory(a,q)
    elif a.operation=='flag':
        pm.require(a.task and a.reason,'--task and specific --reason required');q.flag(a.task,a.reason,a.priority)
        if a.source or a.html_page:
            with q.connect()as c:
                r=q.get(a.task);r['details']['source_hints']=a.source
                if a.html_page:r['details']['html_hints']=[{'page':a.html_page,'images':a.image}]
                c.execute('UPDATE jobs SET details=? WHERE key=?',(pm.stable(r['details']),a.task))
        result={'task':a.task,'state':'queued'}
    elif a.operation=='work':result=work(a,q)
    elif a.operation=='advance':result=advance(a,q)
    elif a.operation=='apply':result=apply(a,q)
    elif a.operation=='finish':result=finish(a,q)
    elif a.operation=='import-review':
        job,run=get_run(a,q);pm.require(a.input and a.kind,'--input and --kind required')
        expected='source-review' if a.kind=='source' else 'display-review';pm.require(job['state']==expected,'review phase does not match task')
        document=pm.read(a.input);pm.require(document.get('run_id')==pm.read(run/'plan.json')['run_id'],'review belongs to another run')
        pm.require(document.get('reviewer_kind')=='agent' and len(document.get('reviewer','').strip())>=3,'named agent attribution required')
        name=a.kind+'-review.json';original=run/name
        archive=run/'review-history';archive.mkdir(exist_ok=True);shutil_name=str(time.time_ns())+'-'+name
        (archive/shutil_name).write_bytes(original.read_bytes());pm.write(original,document)
        result={'task':job['key'],'imported':name,'state':expected,'approval':'validated only on advance/stage'}
    elif a.operation=='retry':
        pm.require(a.task and a.reason,'explicit retry task and reason required');q.flag(a.task,a.reason,a.priority);result={'task':a.task,'state':'queued'}
    elif a.operation=='desk':result=desk(q)
    elif a.operation=='export':result={'backup':q.export()}
    else:result=q.get(a.task) if a.task else q.summary()
    emit(result)
if __name__=='__main__':
    try:main()
    except Exception as error:print('photo queue: '+str(error),file=sys.stderr);sys.exit(1)
