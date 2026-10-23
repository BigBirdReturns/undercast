"""Bounded explicit-page HTML image adapter; never execute page JavaScript.

Page and image hosts must be configured. Image URLs must be present in the
retained response, not supplied as arbitrary download targets. This adapter only
produces candidates; source identity and composition still need exact review.
"""
from html.parser import HTMLParser
import html, json, re, urllib.parse as up
class Page(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.images=[];self.text=[];self.ignore=0;self.title=[];self.in_title=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','style'):self.ignore+=1
        if tag=='title':self.in_title=True
        if tag=='img':
            for key in ('data-full','data-orig-file','data-src','src'):
                if a.get(key):self.images.append((a[key],a.get('alt')or a.get('title')or''))
        if tag=='a'and re.search(r'\.(?:jpg|jpeg|png|webp)(?:\?|$)',a.get('href',''),re.I):self.images.append((a['href'],a.get('title','')))
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.ignore=max(0,self.ignore-1)
        if tag=='title':self.in_title=False
    def handle_data(self,s):
        if self.in_title:self.title.append(s)
        if not self.ignore and s.strip():self.text.append(s.strip())

def extract(raw,url):
    source=raw.decode('utf-8',errors='replace');p=Page();p.feed(source)
    # Galleries often retain full-size image URLs as literal script data. Read
    # literals only, never execute scripts or synthesize a guessed original URL.
    literals=re.findall(r'''["']((?:https?://|/)[^"'<>\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s]*)?)["']''',source,re.I)
    rows=[];seen=set()
    for relative,label in [(v,'literal image URL in page')for v in literals]+p.images:
        target=up.urljoin(url,html.unescape(relative).replace('\\/','/'))
        if target in seen:continue
        seen.add(target);rows.append({'url':target,'caption':label})
    return {'title':' '.join(p.title),'text':'\n'.join(p.text),'images':rows}

def candidates(pm,cache,root,run,facet,record,hint,policy):
    import io
    from PIL import Image,ImageOps
    page=hint['page'];profile=next((s for s in policy['html_sources']if up.urlsplit(page).hostname in s['page_hosts']),None)
    pm.require(profile,'HTML source host is not configured')
    raw,receipt=cache.get(page,4*1024*1024);parsed=extract(raw,page)
    requested=hint.get('images',[]);pm.require(len(requested)<=6,'at most six explicit HTML images per page')
    available={r['url']:r for r in parsed['images']}
    pm.require(not requested or set(requested)<=set(available),'requested image is not literally linked in the retained page')
    selected=[available[u]for u in requested]if requested else parsed['images'][:6]
    # Retain the exact response and a derived, hash-bound evidence projection.
    rawpath='documents/'+receipt['sha256']+'.html';pm.inside(run,rawpath).parent.mkdir(exist_ok=True);pm.inside(run,rawpath).write_bytes(raw)
    evidence={'page':page,'title':parsed['title'],'text':parsed['text'],'images':parsed['images'],'source_response_sha256':receipt['sha256'],'source_response_path':rawpath}
    wire=(pm.stable(evidence)+'\n').encode();dhash=pm.sha(wire);dpath='documents/'+dhash+'.json';pm.inside(run,dpath).write_bytes(wire)
    docs=[{'path':dpath,'sha256':dhash,'url':page,'title':parsed['title'],'retrieved_at':receipt['retrieved_at'],'text':pm.document_text(evidence),'format':'derived-html-evidence'},{'path':rawpath,'sha256':receipt['sha256'],'url':page,'title':'Exact HTTP response','retrieved_at':receipt['retrieved_at'],'text':parsed['text'],'format':'html'}]
    result=[]
    for entry in selected:
        url=entry['url'];pm.require(up.urlsplit(url).hostname in profile['image_hosts'],'HTML image host outside registered profile')
        body,meta=cache.get(url);im=Image.open(io.BytesIO(body));pm.require(getattr(im,'n_frames',1)==1,'animated source requires separate frame review');im.verify();im=ImageOps.exif_transpose(Image.open(io.BytesIO(body)))
        ext={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}.get(Image.open(io.BytesIO(body)).format);pm.require(ext and min(im.size)>=48,'unsupported or tiny HTML image')
        digest=pm.sha(body);relative='originals/'+digest+ext;target=pm.inside(run,relative);target.parent.mkdir(exist_ok=True);target.write_bytes(body)
        # Anchor scopes the exact asset to its documentary gallery while preserving
        # an ordinary human-openable source page. URLs aren't identity evidence.
        origin=page.split('#')[0]+'#image='+up.quote(up.urlsplit(url).path,safe='')
        row={**facet,'actor':record['actor'],'character':record['character'],'production':record.get('production'),'origin':origin,'source_path':relative,'source_sha256':digest,'source_dimensions':list(im.size),'source_receipt':meta,'author':'','license':profile.get('license','Copyright; source attribution retained'),'documents':docs,'source_adapter':'html','source_image_url':url,'source_caption':entry['caption']}
        row['candidate_key']=pm.fingerprint({k:row[k]for k in ['id','side','record_sha256','source_sha256','origin']});result.append(row)
    return result
