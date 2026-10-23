"""Private same-side composition desk. Candidate variants are proposals, never votes."""
from __future__ import annotations
import argparse, html, io, json, hashlib, shutil
from pathlib import Path
from PIL import Image, ImageOps

POSITIONS={'left':0,'top':0,'upper':28,'center':50,'lower':72,'right':100,'bottom':100}
def focus(a,k,default):
    value=(a.get('focus')or{}).get(k,default)
    return float(value if isinstance(value,(int,float))else POSITIONS[value])/100

def geometry(size,asset,frame):
    w,h=size;fw,fh=frame
    scale=(min if asset.get('fit')=='contain' else max)(fw/w,fh/h)
    return scale,((fw-w*scale)*focus(asset,'x',50),(fh-h*scale)*focus(asset,'y',28))

def render(raw,asset,frame):
    im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
    scale,(x,y)=geometry(im.size,asset,frame)
    scaled=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.LANCZOS)
    out=Image.new('RGB',frame,(28,26,22));out.paste(scaled,(round(x),round(y)));return out

def main(argv=None):
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--run',type=Path,required=True);a=p.parse_args(argv)
    root=a.root.resolve();run=a.run.resolve()
    plan=json.loads((run/'plan.json').read_text());candidates=json.loads((run/'candidates.json').read_text())['candidates']
    source=json.loads((run/'source-review.json').read_text());prepared=json.loads((run/'prepared.json').read_text())if(run/'prepared.json').exists()else None
    display=json.loads((run/'display-review.json').read_text())if(run/'display-review.json').exists()else None
    images=run/'desk-images';images.mkdir(exist_ok=True)
    variants=[];items=[]
    for facet in plan['facets']:
        record=next(r for r in plan['records']if r['id']==facet['id']);old=facet.get('before');oldsrc=None
        if old and (root/old['src']).exists():
            raw=(root/old['src']).read_bytes();digest=hashlib.sha256(raw).hexdigest();dest=images/(digest+'.jpg')
            im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB');im.thumbnail((900,900));im.save(dest,quality=90)
            oldsrc=dest.relative_to(run).as_posix()
        pool=[]
        for c in candidates:
            if(c['id'],c['side'])!=(facet['id'],facet['side']):continue
            raw=(run/c['source_path']).read_bytes();im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB');im.thumbnail((1000,1000))
            dest=images/(c['source_sha256']+'.jpg');im.save(dest,quality=90)
            entry={**c,'preview':dest.relative_to(run).as_posix()};pool.append(entry)
            for name,fit,y in [('whole-source','contain',50),('upper-cover','cover',28),('center-cover','cover',50),('top-cover','cover',0)]:
                asset={'fit':fit,'focus':{'x':50,'y':y}}
                screens={}
                for label,frame in [('card',(320,240)),('record',(320,400))]:
                    path=images/(c['candidate_key'][:16]+'-'+name+'-'+label+'.jpg');render(raw,asset,frame).save(path,quality=90)
                    screens[label]=path.relative_to(run).as_posix()
                variants.append({'id':c['id'],'side':c['side'],'candidate_key':c['candidate_key'],'source_sha256':c['source_sha256'],'name':name,'asset':asset,'screens':screens,'decision':'pending'})
        items.append({'facet':facet,'record':record,'current':old,'current_preview':oldsrc,'candidates':pool})
    (run/'variants.json').write_text(json.dumps({'version':1,'run_id':plan['run_id'],'variants':variants,'model_calls':0,'approvals':0},indent=2)+'\n')
    data={'plan':plan,'source':source,'prepared':prepared,'display':display,'items':items}
    content=HTML.replace('__DATA__',json.dumps(data,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026'))
    (run/'review.html').write_text(content)
    print(json.dumps({'run_id':plan['run_id'],'variants':len(variants),'frames':len(variants)*2,'review':str(run/'review.html'),'approvals':0}))

HTML=r'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UnderCast photo desk</title>
<style>
:root{--paper:#e4dfd5;--ink:#1c1a16;--line:#b2aa9b}body{background:var(--paper);color:var(--ink);font:16px/1.45 system-ui;margin:24px}h1,h2{font-family:Georgia,serif}h1{font-size:32px}h2{font-size:23px}article{border-top:1px solid var(--ink);padding:24px 0;max-width:1200px}.row{display:flex;gap:18px;flex-wrap:wrap}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:780px;width:100%}.frame{position:relative;aspect-ratio:4/3;overflow:hidden;background:#1c1a16}.frame.tall{aspect-ratio:4/5}.frame img{position:absolute;inset:0;width:100%;height:100%;max-width:none;object-fit:cover}.region{position:absolute;border:2px solid #efdb73;pointer-events:none;box-sizing:border-box}.control{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}label{display:block}input,select,textarea,button{font:inherit;padding:9px;max-width:100%;box-sizing:border-box}textarea{width:100%;min-height:80px}input[type=number]{width:90px}button{cursor:pointer;background:#211f1b;color:#fff;border:0;min-height:42px}a{color:#345a53}pre{white-space:pre-wrap;max-height:320px;overflow:auto;border:1px solid var(--line);padding:12px}small{display:block}.status{padding:12px;border:1px solid var(--line)}.bad{color:#9f3024}figure{margin:0}figcaption{padding:6px 0}.evidence{max-width:1050px}canvas{max-width:100%}@media(max-width:600px){body{margin:14px}.pair{gap:8px}h1{font-size:27px}}
</style><h1>Photographic maintenance desk</h1><p>Compare the same image side in both production frames. Source captions establish identity; your protected region and visual decision govern composition. Nothing here publishes or approves itself.</p>
<label>Reviewer attribution <input id="reviewer" placeholder="agent identifier" required></label><p id="run"></p><main id="items"></main><div class="control"><button id="export-source">Export source decisions</button><button id="export-display">Export display decisions</button></div><p id="message" role="status"></p>
<script id="data" type="application/json">__DATA__</script><script>
'use strict';const D=JSON.parse(document.getElementById('data').textContent),S=structuredClone(D.source),V=D.display&&structuredClone(D.display),root=document.getElementById('items');
const el=(name,text)=>{const n=document.createElement(name);if(text!==undefined)n.textContent=text;return n};const positions={left:0,top:0,upper:28,center:50,lower:72,right:100,bottom:100};const pct=(a,k,d)=>{const v=a?.focus?.[k]??d;return typeof v==='number'?v:positions[v]};
document.getElementById('reviewer').value=S.reviewer||'';document.getElementById('run').textContent='Run '+D.plan.run_id;
const pending=[];
for(const item of D.items){
 const f=item.facet,s=S.selections.find(x=>x.id===f.id&&x.side===f.side),art=el('article');root.append(art);art.append(el('h2',f.id+' / '+f.side+' · '+item.record.character+' / '+item.record.actor));
 const action=el('select');for(const v of ['pending','select','keep','defer','reject'])action.add(new Option(v,v));action.value=s.action;action.setAttribute('aria-label','Source decision');art.append(action);
 const choose=el('select');choose.add(new Option('Select source candidate',''));for(const c of item.candidates)choose.add(new Option(c.origin+' · '+c.source_dimensions.join(' × '),c.candidate_key));choose.value=s.candidate_key||'';choose.setAttribute('aria-label','Source candidate');art.append(choose);
 const pair=el('div');pair.className='pair';art.append(pair);const frames=[];
 for(const [title,src,asset]of[['Current card',item.current_preview,item.current],['Candidate card',null,null],['Current permanent record',item.current_preview,item.current],['Candidate permanent record',null,null]]){
  const fig=el('figure'),box=el('div');box.className='frame'+(title.includes('permanent')?' tall':'');const im=el('img');im.alt=title;if(src)im.src=src;else im.hidden=true;
  im.style.objectFit=asset?.fit||'cover';im.style.objectPosition=pct(asset,'x',50)+'% '+pct(asset,'y',28)+'%';box.append(im);fig.append(box,el('figcaption',title));pair.append(fig);frames.push({box,im});
 }
 const controls=el('div');controls.className='control';art.append(controls);const fit=el('select');for(const v of ['contain','cover'])fit.add(new Option(v,v));fit.value=s.fit||'contain';fit.setAttribute('aria-label','Image fit');controls.append(fit);
 const fx=el('input'),fy=el('input');for(const [n,name,value]of[[fx,'X position',pct(s,'x',50)],[fy,'Y position',pct(s,'y',50)]]){n.type='number';n.min=0;n.max=100;n.value=value;const l=el('label',name+' % ');l.append(n);controls.append(l);}
 const crop=el('input');crop.placeholder='optional crop: left, top, right, bottom';crop.setAttribute('aria-label','Source crop');crop.size=44;crop.value=s.crop_box_px?.join(', ')||'';art.append(el('label','Source-coordinate crop (empty retains the full source)'),crop);
 const region=el('input');region.setAttribute('aria-label','Protected source region');region.size=44;region.placeholder='left, top, right, bottom';region.value=s.composition?.protected_region_px?.join(', ')||'';art.append(el('label','Protected head / silhouette region, in source pixels'),region);
 const max=el('input');max.type='number';max.min=.1;max.max=1;max.step=.01;max.value=s.composition?.max_height_fraction??.85;const ml=el('label','Maximum region height as fraction of frame ');ml.append(max);art.append(ml);
 const margin=el('input');margin.type='number';margin.min=0;margin.max=.2;margin.step=.01;margin.value=s.composition?.min_margin_fraction??.02;const mm=el('label','Minimum clear margin as fraction of each frame dimension ');mm.append(margin);art.append(mm);
 const reason=el('textarea');reason.setAttribute('aria-label','Decision rationale');reason.value=s.reason||'';reason.placeholder='Why this source / composition is suitable, or why it must be held.';art.append(el('label','Decision rationale'),reason);
 const docs=el('select'),quote=el('textarea'),text=el('pre'),link=el('a');quote.setAttribute('aria-label','Exact supporting passage');docs.setAttribute('aria-label','Evidence document');link.textContent='Open exact source';link.target='_blank';link.rel='noopener';art.append(link,el('h3','Documentary evidence'),docs,text,el('label','Exact supporting passage'),quote);
 const status=el('p');status.className='status';art.append(status);let candidate=null;const arr=v=>v.trim()?v.split(',').map(Number):null;
 function paint(){
  if(!candidate)return;const rect=arr(crop.value),reg=arr(region.value);let w=candidate.source_dimensions[0],h=candidate.source_dimensions[1];const [l,t,r,b]=rect||[0,0,w,h];
  s.action=action.value;s.candidate_key=candidate.candidate_key;s.fit=fit.value;s.focus={x:+fx.value,y:+fy.value};s.crop_box_px=rect;s.reason=reason.value;
  s.composition=reg?{protected_region_px:reg,max_height_fraction:+max.value,min_margin_fraction:+margin.value}:null;
  let ok=(!D.plan.composition_review||!!reg),message=[];if(!reg)message.push('Protected region not yet recorded.');
  for(const i of[1,3]){
   const frame=frames[i],rw=r-l,rh=b-t,fw=320,fh=i===1?240:400;const scale=(fit.value==='contain'?Math.min:Math.max)(fw/rw,fh/rh),ox=(fw-rw*scale)*(+fx.value/100),oy=(fh-rh*scale)*(+fy.value/100);
   frame.im.hidden=false;frame.im.src=candidate.preview;frame.im.style.objectFit='fill';frame.im.style.width=(w*scale/fw*100)+'%';frame.im.style.height=(h*scale/fh*100)+'%';frame.im.style.left=((ox-l*scale)/fw*100)+'%';frame.im.style.top=((oy-t*scale)/fh*100)+'%';frame.im.style.maxWidth='none';
   frame.box.querySelector('.region')?.remove();
   if(reg){const[x0,y0,x1,y1]=reg.map((v,j)=>v-(j%2?t:l)),x=ox+x0*scale,y=oy+y0*scale,rw2=(x1-x0)*scale,rh2=(y1-y0)*scale;
    const overlay=el('div');overlay.className='region';Object.assign(overlay.style,{left:x/fw*100+'%',top:y/fh*100+'%',width:rw2/fw*100+'%',height:rh2/fh*100+'%'});frame.box.append(overlay);
    const passes=x>=fw*+margin.value&&y>=fh*+margin.value&&x+rw2<=fw*(1-+margin.value)&&y+rh2<=fh*(1-+margin.value)&&rh2/fh<=+max.value;
    ok&&=passes;message.push((i===1?'Card':'Record')+': region height '+(rh2/fh*100).toFixed(1)+'%, '+(passes?'within declared bounds':'FAIL: clipping / insufficient context'));
   }
  }
  status.textContent=message.join(' · ');status.classList.toggle('bad',!ok);return ok;
 }
 for(const i of [1,3]){
  const box=frames[i].box;box.style.touchAction='none';let start=null;
  const point=e=>{const rect=frames[i].im.getBoundingClientRect();return [Math.max(0,Math.min(candidate.source_dimensions[0],Math.round((e.clientX-rect.left)/rect.width*candidate.source_dimensions[0]))),Math.max(0,Math.min(candidate.source_dimensions[1],Math.round((e.clientY-rect.top)/rect.height*candidate.source_dimensions[1])))];};
  box.addEventListener('pointerdown',e=>{if(!candidate)return;start={point:point(e),crop:e.shiftKey};box.setPointerCapture(e.pointerId);e.preventDefault();});
  box.addEventListener('pointerup',e=>{if(!start)return;const end=point(e),v=[Math.min(start.point[0],end[0]),Math.min(start.point[1],end[1]),Math.max(start.point[0],end[0]),Math.max(start.point[1],end[1])];if(v[2]>v[0]&&v[3]>v[1])(start.crop?crop:region).value=v.join(', ');start=null;paint();});
 }
 art.append(el('small','Drag over the proposed image to mark the protected head or silhouette. Shift-drag sets a source crop.'));
 function chosen(){candidate=item.candidates.find(c=>c.candidate_key===choose.value);if(!candidate)return;docs.replaceChildren();for(const d of candidate.documents)docs.add(new Option(d.title+' · '+d.sha256.slice(0,12),d.sha256));link.href=candidate.origin;text.textContent=candidate.documents[0]?.text||'';paint();}
 choose.onchange=()=>{crop.value='';region.value='';quote.value='';action.value='select';chosen();};docs.onchange=()=>text.textContent=candidate.documents.find(d=>d.sha256===docs.value)?.text||'';
 for(const n of[action,fit,fx,fy,crop,region,max,margin,reason])n.addEventListener('input',paint);chosen();
 pending.push(()=>{s.action=action.value;s.reason=reason.value;if(s.action==='select'){if(!paint())throw Error(f.id+': composition bounds need attention');const d=candidate.documents.find(d=>d.sha256===docs.value);if(quote.value.length<12||!d.text.includes(quote.value))throw Error(f.id+': retain an exact documentary passage');s.evidence=[{document_sha256:d.sha256,quote:quote.value}];}if(s.action==='pending'||s.reason.trim().length<12)throw Error(f.id+': explicit decision and rationale required');});
}
if(V){const section=el('article');root.append(section);section.append(el('h2','Prepared-byte approval'));for(const d of V.decisions){const p=D.prepared.changes.find(c=>c.candidate_key===d.candidate_key);section.append(el('h3',p.id+'/'+p.side+' · '+p.display_sha256.slice(0,16)));const a=el('a','Open prepared image');a.href=p.display_path;a.target='_blank';section.append(a);const sel=el('select');for(const v of ['pending','approve','reject'])sel.add(new Option(v,v));sel.value=d.decision;sel.onchange=()=>d.decision=sel.value;section.append(sel);const n=el('textarea');n.placeholder='Actual prepared image / both production frames review';n.value=d.note||'';n.oninput=()=>d.note=n.value;section.append(n);}}
function download(name,value){const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
function reviewer(){const r=document.getElementById('reviewer').value.trim();if(r.length<3)throw Error('Named agent reviewer required');return r;}
document.getElementById('export-source').onclick=()=>{try{S.reviewer=reviewer();pending.forEach(f=>f());download('source-review.json',S);document.getElementById('message').textContent='Source decisions exported; import into this exact run and advance.';}catch(e){document.getElementById('message').textContent=e.message;}};
document.getElementById('export-display').disabled=!V;document.getElementById('export-display').onclick=()=>{try{V.reviewer=reviewer();if(V.decisions.some(d=>!['approve','reject'].includes(d.decision)||d.note.trim().length<12))throw Error('Every prepared image needs an explicit decision and note');download('display-review.json',V);}catch(e){document.getElementById('message').textContent=e.message;}};
</script></html>'''
if __name__=='__main__':main()
