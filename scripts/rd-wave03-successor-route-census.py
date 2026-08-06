#!/usr/bin/env python3
from __future__ import annotations
import argparse, collections, hashlib, json, pathlib, re, sys
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlparse, urlunparse
ROOT=pathlib.Path(__file__).resolve().parents[1]
LEDGER_PATH=ROOT/'data/research/residual-denominator/wave-03/successor-route-census/ledger.json'
MANIFEST_PATH=ROOT/'data/research/residual-denominator/wave-03/successor-route-census/manifest.json'
SCHEMA_PATH=ROOT/'schema/rd-wave03-successor-route-census.schema.json'
ISSUE=471
PARENT_HEAD='7ef9d07cd4d258302d15e1ee69958397eaf48ffe'
PARENT_TREE='3abaac9aa1b2b3f87549fe40a5f9237bb3c19b1a'
OBJECTS=[{'file': 'rd01-off-001.html',
  'capture_object_id': 'RD-W03-XCAP-01-01',
  'source_route_id': 'RD01-OFF-001',
  'cell_id': 'RD-01:EDITION-01:selected_entities',
  'lane_id': 'RD-01',
  'source_url': 'https://www.natsec100.org/',
  'sha256': 'd5622473c00049904bf421a41ad0bccc67e2dd085dc4b38a2a2ed886552ee82e',
  'bytes': 1099278,
  'refusal_class': 'missing_frozen_id_mapping'},
 {'file': 'rd02-off-004.html',
  'capture_object_id': 'RD-W03-XCAP-01-02',
  'source_route_id': 'RD02-OFF-004',
  'cell_id': 'RD-02:MOONSHOTS-CAPITAL-FUND-3-SBIC-LP:leverage_commitment',
  'lane_id': 'RD-02',
  'source_url': 'https://www.sba.gov/loans/additional-funding-opportunities/investment-capital/',
  'sha256': '9352fdff89dcbdf27415b48d31713367b8cb50dffbe4271a05f5c0678565b9c4',
  'bytes': 140712,
  'refusal_class': 'wrong_substantive_source_object'},
 {'file': 'rd04-off-004.html',
  'capture_object_id': 'RD-W03-XCAP-01-03',
  'source_route_id': 'RD04-OFF-004',
  'cell_id': 'RD-04:AL:hearing',
  'lane_id': 'RD-04',
  'source_url': 'https://www.cdss.ca.gov/inforesources/cdss-programs/appeals-hearings',
  'sha256': 'f223ec936a57df07fca99ecfb8858c35fa45bb5c7fca499558b9c4f6590347d9',
  'bytes': 25587,
  'refusal_class': 'wrong_substantive_source_object'},
 {'file': 'rd04-off-005.html',
  'capture_object_id': 'RD-W03-XCAP-01-04',
  'source_route_id': 'RD04-OFF-005',
  'cell_id': 'RD-04:AL:stay',
  'lane_id': 'RD-04',
  'source_url': 'https://www.cdss.ca.gov/inforesources/calfresh',
  'sha256': '10dd9ba8487a9b9297640adde4090306768f34542618d8ba7082c6abf62d2494',
  'bytes': 27084,
  'refusal_class': 'wrong_substantive_source_object'},
 {'file': 'rd05-off-001.html',
  'capture_object_id': 'RD-W03-XCAP-01-05',
  'source_route_id': 'RD05-OFF-001',
  'cell_id': 'RD-05:ACES-MEMBER-01:appointment',
  'lane_id': 'RD-05',
  'source_url': 'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/',
  'sha256': 'c5556387fcf678e1dccd049b3116a0692588551f25ddb6c6d939cf7b2eb3d3c5',
  'bytes': 318465,
  'refusal_class': 'missing_frozen_id_mapping'},
 {'file': 'rd05-off-002.html',
  'capture_object_id': 'RD-W03-XCAP-01-06',
  'source_route_id': 'RD05-OFF-002',
  'cell_id': 'RD-05:ACES-MEMBER-01:term',
  'lane_id': 'RD-05',
  'source_url': 'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/',
  'sha256': '388e324fefc5a01eb2b78e450e544e690b3cae90d968891192a3ae851597f7c1',
  'bytes': 321112,
  'refusal_class': 'missing_frozen_id_mapping'},
 {'file': 'rd05-off-003.html',
  'capture_object_id': 'RD-W03-XCAP-01-07',
  'source_route_id': 'RD05-OFF-003',
  'cell_id': 'RD-05:ACES-MEMBER-01:meeting_attendance',
  'lane_id': 'RD-05',
  'source_url': 'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-meetings/',
  'sha256': 'd3b60eb96340cbee3d7c9b14d10c89b4f6d96c4838840a1478ce182004dfb62f',
  'bytes': 314664,
  'refusal_class': 'missing_frozen_id_mapping'},
 {'file': 'rd05-off-005.html',
  'capture_object_id': 'RD-W03-XCAP-01-08',
  'source_route_id': 'RD05-OFF-005',
  'cell_id': 'RD-05:ACES-MEMBER-01:recommendation',
  'lane_id': 'RD-05',
  'source_url': 'https://www.nsf.gov/nsb/about',
  'sha256': '9166569bf6260c91a33f348ac023271c0fb0a5d2639cbfc12f017aa77431f59a',
  'bytes': 70515,
  'refusal_class': 'wrong_substantive_source_object'},
 {'file': 'rd05-off-007.html',
  'capture_object_id': 'RD-W03-XCAP-01-09',
  'source_route_id': 'RD05-OFF-007',
  'cell_id': 'RD-05:ACES-MEMBER-01:disposition',
  'lane_id': 'RD-05',
  'source_url': 'https://www.nsf.gov/nsb/publications',
  'sha256': '22c63b32f6f3af9a451f8cde48ff749dfb9477ee93a2764a960125e219945761',
  'bytes': 107364,
  'refusal_class': 'wrong_substantive_source_object'}]
SELECTORS=[('rd01-off-001.html', 26, '2025', 'https://www.natsec100.org/natsec100-2025', 'edition_page', 'RD-01', ['edition_identity', 'selected_entities'], True),
 ('rd01-off-001.html', 27, '2024', 'https://www.natsec100.org/natsec100-2024', 'edition_page', 'RD-01', ['edition_identity', 'selected_entities'], True),
 ('rd01-off-001.html', 28, '2023', 'https://www.natsec100.org/natsec100-2023', 'edition_page', 'RD-01', ['edition_identity', 'selected_entities'], True),
 ('rd01-off-001.html', 29, 'Download the Report', 'https://www.natsec100.org/s/2026-NatSec100-Report-WEB.pdf', 'report_pdf', 'RD-01', ['selected_entities', 'ranking_date'], True),
 ('rd02-off-004.html',
  90,
  'Find an SBIC',
  'http://sba.gov/funding-programs/investment-capital/sbic-directory',
  'official_directory',
  'RD-02',
  ['unit_identity', 'leverage_commitment'],
  False),
 ('rd05-off-001.html',
  127,
  'Licensing of Private Remote Sensing Space Systems',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-subcommittee-on-licensing-of-private-remote-sensing-space-systems/',
  'subcommittee_page',
  'RD-05',
  ['subcommittee'],
  True),
 ('rd05-off-001.html',
  128,
  'Commercial Space Mission Authorization',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-subcommittee-on-commercial-space-mission-authorization/',
  'subcommittee_page',
  'RD-05',
  ['subcommittee'],
  True),
 ('rd05-off-001.html',
  129,
  'Space Sustainability, including Space Situational Awareness',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-subcommittee-on-space-sustainability/',
  'subcommittee_page',
  'RD-05',
  ['subcommittee'],
  True),
 ('rd05-off-001.html',
  132,
  'View charter (PDF)',
  'https://space.commerce.gov/wp-content/uploads/2024-03-ACES-charter.pdf',
  'charter_pdf',
  'RD-05',
  ['committee_charter', 'term_context'],
  False),
 ('rd05-off-002.html',
  126,
  'Ms. Caryn Schenewerk',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/caryn-schenewerk/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  127,
  'Mr. David Gauthier',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/david-gauthier/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  130,
  'Ms. Blake Bullock',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/blake-bullock/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  131,
  'Mr. Dave Cavossa',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/dave-cavossa/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  132,
  'Dr. Mary Lynne Dittmar',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/mary-lynne-dittmar/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  133,
  'Dr. Brien Flewelling',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/brien-flewelling/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  134,
  'Mr. Tony Frazier',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/tony-frazier/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  135,
  'Col (ret) Elvert Gardner',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/elvert-gardner/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  136,
  'Mr. Alex Gilbert',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/alex-gilbert/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  137,
  'Mr. Kalpak Gude,',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/kalpak-gude/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  138,
  'Mr. Jared Hautamaki',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/jared-hautamaki/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  139,
  'Mr. Chris Kunstadter',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/christopher-kunstadter/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  140,
  'Dr. Clare Martin',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/clare-martin/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  141,
  'Mr. Michael Nicolls,',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/michael-nicolls/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  142,
  'Ms. Danielle Piñeres,',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/danielle-pineres/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  143,
  'Ms. Audrey Schaffer',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/audrey-m-schaffer/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-002.html',
  144,
  'Mr. Al Tadros',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-membership/al-tadros/',
  'member_profile',
  'RD-05',
  ['unit_identity', 'appointment', 'term'],
  True),
 ('rd05-off-003.html',
  126,
  'March 5, 2025',
  'https://space.commerce.gov/advisory-committee-on-excellence-in-space-aces/aces-meetings/march-2025-meeting/',
  'meeting_detail',
  'RD-05',
  ['meeting_record', 'meeting_attendance'],
  True),
 ('rd05-off-003.html',
  127,
  'October 3, 2024',
  'https://space.commerce.gov/first-aces-public-meeting-set-for-october-3/',
  'meeting_detail',
  'RD-05',
  ['meeting_record', 'meeting_attendance'],
  True)]
CANDIDATE_REASON={'charter_pdf': 'official ACES charter linked from the captured committee page; committee governance cannot establish an individual member event',
 'edition_page': 'edition-specific official page linked from the captured NatSec index; an independently receipted opaque edition-ID map is still required',
 'meeting_detail': 'official ACES meeting detail linked from the captured meetings index; a meeting record cannot establish individual attendance without an '
                   'exact member join and attendance record',
 'member_profile': 'official named ACES member profile linked from the captured membership page; the name cannot be joined to an opaque frozen member ID by '
                   'ordinal position',
 'official_directory': 'official directory linked from the generic SBA program page; the target fund, leverage commitment, amount, and event chronology remain '
                       'unbound',
 'report_pdf': 'official report PDF linked from the captured current edition; selected entities and chronology remain unverified until exact bytes are '
               'captured and mapped',
 'subcommittee_page': 'official ACES subcommittee page linked from the captured committee page; it cannot establish member participation, recommendation, or '
                      'disposition without exact attribution'}
SHA256_RE=re.compile(r'^[0-9a-f]{64}$')
EXPECTED_SUMMARY={'retained_bodies':9,'body_bytes':2424781,'anchor_observations':785,'per_object_unique_url_observations':686,'global_unique_urls':438,'query_bearing_observations':9,'same_host_observations':586,'same_registrable_domain_observations':737,'https_observations':766,'http_observations':19,'selected_successor_routes':28,'candidate_class_counts':{'charter_pdf':1,'edition_page':3,'meeting_detail':2,'member_profile':17,'official_directory':1,'report_pdf':1,'subcommittee_page':3},'mapping_required_routes':26,'zero_direct_successor_gaps':4,'missing_mapping_objects':4,'wrong_source_objects':5,'live_source_requests':0,'evidence_admissions':0,'chronology_resolutions':0,'classes_closed':0}
EXPECTED_INTEGRITY={'object_custody_sha256':'6fc253c87deb7b419153d45f93023f13b696844e78310172af89fd0c34dab874','anchor_observations_sha256':'862db807cdd8f9c03ca5107f87fd9a9422233ad62b359e278bbf26de96c42cdb','successor_routes_sha256':'160c0f500b7df184ab084e031704f2dead793f13807c2cbdb8cc612f72dd998f','gap_register_sha256':'87c5ed11dc133bc24532e1ab3264c2dc6b38c95d1b5edcfe43f00fc1d9c1c9ae'}
class AnchorParser(HTMLParser):
 def __init__(self): super().__init__(convert_charrefs=True); self.stack=[]; self.anchors=[]; self.base_href=None
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs); tag=tag.lower()
  if tag=='a': self.stack.append({'href':attrs.get('href'),'title':attrs.get('title') or '','text':[]})
  elif tag=='base' and attrs.get('href'): self.base_href=attrs['href']
 def handle_data(self,data):
  if self.stack:self.stack[-1]['text'].append(data)
 def handle_endtag(self,tag):
  if tag.lower()=='a' and self.stack:
   row=self.stack.pop(); row['text']=re.sub(r'\s+',' ',unescape(''.join(row['text']))).strip(); self.anchors.append(row)
def canonical_json(v): return json.dumps(v,indent=2,sort_keys=True,ensure_ascii=False)+'\n'
def compact_json(v): return json.dumps(v,separators=(',',':'),sort_keys=True,ensure_ascii=False).encode()
def sha256_bytes(data): return hashlib.sha256(data).hexdigest()
def read_json(path): return json.loads(path.read_text(encoding='utf-8'))
def exact_keys(v,keys,label):
 if set(v)!=set(keys): raise ValueError(f'{label} keys drifted')
def norm_host(host):
 host=(host or '').lower().rstrip('.'); return host[4:] if host.startswith('www.') else host
def registrableish(host):
 parts=norm_host(host).split('.'); return '.'.join(parts[-2:]) if len(parts)>=2 else norm_host(host)
def normalize_candidate_url(url,route_class):
 parsed=urlparse(url)
 if route_class=='official_directory' and parsed.scheme=='http': parsed=parsed._replace(scheme='https')
 return urlunparse(parsed)
def extract_object(capture_root,spec):
 path=pathlib.Path(capture_root)/spec['file']; body=path.read_bytes()
 if len(body)!=spec['bytes'] or sha256_bytes(body)!=spec['sha256']: raise ValueError(f"body custody mismatch: {spec['file']}")
 parser=AnchorParser(); parser.feed(body.decode('utf-8',errors='replace')); base=parser.base_href or spec['source_url']; source_host=urlparse(base).hostname or ''
 rows=[]; seen=set()
 for ordinal,anchor in enumerate(parser.anchors,1):
  raw=anchor.get('href')
  if not raw: continue
  raw=unescape(raw.strip())
  if raw.lower().startswith(('javascript:','mailto:','tel:','data:')): continue
  absolute,_=urldefrag(urljoin(base,raw)); parsed=urlparse(absolute)
  if parsed.scheme not in ('http','https') or not parsed.hostname: continue
  key=(absolute,anchor['text'])
  if key in seen: continue
  seen.add(key)
  rows.append({'ordinal':ordinal,'anchor_text':anchor['text'],'anchor_title':anchor['title'],'original_href':raw,'absolute_url':absolute,'scheme':parsed.scheme,'host':parsed.hostname.lower(),'path':parsed.path or '/','query':parsed.query,'same_host':norm_host(parsed.hostname)==norm_host(source_host),'same_registrable_domain':registrableish(parsed.hostname)==registrableish(source_host),'selected_candidate':False,'candidate_id':None,'decision':'excluded_context_or_navigation'})
 return {**spec,'anchor_observations':rows,'anchor_count':len(rows),'unique_url_count':len({r['absolute_url'] for r in rows})}
def compact_object(obj):
 rows=obj['anchor_observations']
 return {key:obj[key] for key in ['file','capture_object_id','source_route_id','cell_id','lane_id','source_url','sha256','bytes','refusal_class']} | {'anchor_count':obj['anchor_count'],'unique_url_count':obj['unique_url_count'],'query_bearing_count':sum(bool(r['query']) for r in rows),'same_host_count':sum(r['same_host'] for r in rows),'same_registrable_domain_count':sum(r['same_registrable_domain'] for r in rows),'https_count':sum(r['scheme']=='https' for r in rows),'http_count':sum(r['scheme']=='http' for r in rows),'anchor_observations_sha256':sha256_bytes(compact_json(rows))}
def gap_register(): return [
 {'gap_id':'RD01-OPAQUE-EDITION-MAP','lane_id':'RD-01','cells':['RD-01:EDITION-01:selected_entities'],'status':'contract_mapping_required','direct_candidate_count':4,'boundary':'Edition pages and the report PDF cannot map EDITION-01..03 by display order.'},
 {'gap_id':'RD02-SPECIFIC-SBIC-OBJECT','lane_id':'RD-02','cells':['RD-02:MOONSHOTS-CAPITAL-FUND-3-SBIC-LP:leverage_commitment'],'status':'directory_candidate_available','direct_candidate_count':1,'boundary':'The directory route is not a Moonshots-specific commitment object.'},
 {'gap_id':'RD04-AL-HEARING','lane_id':'RD-04','cells':['RD-04:AL:hearing'],'status':'no_direct_successor_link','direct_candidate_count':0,'boundary':'The retained California page has no Alabama official-source successor.'},
 {'gap_id':'RD04-AL-STAY','lane_id':'RD-04','cells':['RD-04:AL:stay'],'status':'no_direct_successor_link','direct_candidate_count':0,'boundary':'The retained California page has no Alabama official-source successor.'},
 {'gap_id':'RD05-OPAQUE-MEMBER-MAP','lane_id':'RD-05','cells':['RD-05:ACES-MEMBER-01:appointment','RD-05:ACES-MEMBER-01:term','RD-05:ACES-MEMBER-01:meeting_attendance'],'status':'contract_mapping_required','direct_candidate_count':19,'boundary':'Named profiles and meeting pages cannot map ACES-MEMBER-01..17 by list order.'},
 {'gap_id':'RD05-RECOMMENDATION','lane_id':'RD-05','cells':['RD-05:ACES-MEMBER-01:recommendation'],'status':'no_direct_successor_link','direct_candidate_count':0,'boundary':'The retained NSB page has no direct ACES recommendation successor.'},
 {'gap_id':'RD05-DISPOSITION','lane_id':'RD-05','cells':['RD-05:ACES-MEMBER-01:disposition'],'status':'no_direct_successor_link','direct_candidate_count':0,'boundary':'The retained NSB publications page has no direct ACES disposition successor.'}]
def compute_integrity(compact_objects,full_objects,routes,gaps):
 anchors=[{'file':o['file'],'anchor_observations':o['anchor_observations']} for o in full_objects]
 return {'object_custody_sha256':sha256_bytes(compact_json(compact_objects)),'anchor_observations_sha256':sha256_bytes(compact_json(anchors)),'successor_routes_sha256':sha256_bytes(compact_json(routes)),'gap_register_sha256':sha256_bytes(compact_json(gaps))}
def build_ledger(capture_root):
 full=[extract_object(capture_root,s) for s in OBJECTS]; by_file={o['file']:o for o in full}; routes=[]
 for index,selector in enumerate(SELECTORS,1):
  file,ordinal,text,absolute_url,route_class,lane_id,target_families,mapping_required=selector
  matches=[r for r in by_file[file]['anchor_observations'] if r['ordinal']==ordinal]
  if len(matches)!=1: raise ValueError(f'candidate selector ordinal mismatch: {file}:{ordinal}')
  row=matches[0]
  if row['anchor_text']!=text or row['absolute_url']!=absolute_url: raise ValueError(f'candidate selector content mismatch: {file}:{ordinal}')
  candidate_id=f'RD-W03-SUCC-{index:03d}'; normalized=normalize_candidate_url(row['absolute_url'],route_class); parsed=urlparse(normalized)
  if parsed.scheme!='https' or parsed.query or parsed.fragment: raise ValueError(f'candidate URL normalization failed: {candidate_id}')
  row['selected_candidate']=True; row['candidate_id']=candidate_id; row['decision']='selected_unexecuted_candidate'; source=by_file[file]
  routes.append({'candidate_id':candidate_id,'source_capture_object_id':source['capture_object_id'],'source_file':file,'source_body_sha256':source['sha256'],'source_body_bytes':source['bytes'],'source_route_id':source['source_route_id'],'source_cell_id':source['cell_id'],'anchor_ordinal':ordinal,'anchor_text':text,'original_href':row['original_href'],'absolute_url':row['absolute_url'],'normalized_url':normalized,'route_class':route_class,'lane_id':lane_id,'target_families':target_families,'frozen_id_mapping_required':mapping_required,'status':'unexecuted_candidate','candidate_only_reason':CANDIDATE_REASON[route_class],'automatic_admission':False})
 compact=[compact_object(o) for o in full]; gaps=gap_register(); all_rows=[r for o in full for r in o['anchor_observations']]
 summary={'retained_bodies':len(full),'body_bytes':sum(o['bytes'] for o in full),'anchor_observations':len(all_rows),'per_object_unique_url_observations':sum(o['unique_url_count'] for o in full),'global_unique_urls':len({r['absolute_url'] for r in all_rows}),'query_bearing_observations':sum(bool(r['query']) for r in all_rows),'same_host_observations':sum(r['same_host'] for r in all_rows),'same_registrable_domain_observations':sum(r['same_registrable_domain'] for r in all_rows),'https_observations':sum(r['scheme']=='https' for r in all_rows),'http_observations':sum(r['scheme']=='http' for r in all_rows),'selected_successor_routes':len(routes),'candidate_class_counts':dict(sorted(collections.Counter(r['route_class'] for r in routes).items())),'mapping_required_routes':sum(r['frozen_id_mapping_required'] for r in routes),'zero_direct_successor_gaps':sum(g['direct_candidate_count']==0 for g in gaps),'missing_mapping_objects':sum(o['refusal_class']=='missing_frozen_id_mapping' for o in full),'wrong_source_objects':sum(o['refusal_class']=='wrong_substantive_source_object' for o in full),'live_source_requests':0,'evidence_admissions':0,'chronology_resolutions':0,'classes_closed':0}
 ledger={'schema_version':1,'ledger_id':'RD-W03-SUCCESSOR-ROUTE-CENSUS-01','issue':ISSUE,'status':'complete_offline_successor_census','parent_product':{'pull_request':468,'head':PARENT_HEAD,'tree':PARENT_TREE,'base_capture_pull_request':409,'base_capture_head':'b996deefe04f73580bd5480bd4c388e6f313f02a'},'input_custody':{'capture_verification_artifact_id':8940053176,'capture_verification_artifact_digest':'sha256:b0fb0b27259349775b0d48b4eeab3024a5831139c05ebe58a3955aaf50d3e079','admission_finalizer_run_id':31034424330,'admission_artifact_id':8942065297,'admission_artifact_digest':'sha256:51f875f1c8159ae3cdb004071388ad38c51daac4b3dad11232a5157f6f13a3c6'},'policy':{'live_source_requests':0,'result_spawned_followups':0,'automatic_admission':False,'ordinal_unit_mapping_allowed':False,'candidate_route_is_evidence':False,'future_request_policy':{'authorized_now':False,'method':'GET','maximum_attempts':1,'timeout_ms':45000,'maximum_body_bytes':5242880,'concurrency':2,'automatic_second_pass':False,'result_spawned_followups':0}},'objects':compact,'successor_routes':routes,'gap_register':gaps,'integrity':compute_integrity(compact,full,routes,gaps),'authority':{'external_contacts':0,'external_reviews':0,'outside_human_dependency':False,'physical_user_action_required':False,'evidence_admissions':0,'chronology_resolutions':0,'classes_closed':0,'publication_effect':'none','adoption_effect':'none','graph_effect':'none','merge_authority':False},'summary':summary}
 validate_ledger(ledger,allow_placeholders=True); return ledger
def recompute_committed_integrity(ledger):
 return {
  'object_custody_sha256':sha256_bytes(compact_json(ledger['objects'])),
  'anchor_observations_sha256':ledger['integrity'].get('anchor_observations_sha256'),
  'successor_routes_sha256':sha256_bytes(compact_json(ledger['successor_routes'])),
  'gap_register_sha256':sha256_bytes(compact_json(ledger['gap_register'])),
 }
def validate_ledger(ledger,allow_placeholders=False):
 exact_keys(ledger,{'schema_version','ledger_id','issue','status','parent_product','input_custody','policy','objects','successor_routes','gap_register','integrity','authority','summary'},'ledger')
 if ledger['schema_version']!=1 or ledger['ledger_id']!='RD-W03-SUCCESSOR-ROUTE-CENSUS-01' or ledger['issue']!=ISSUE or ledger['status']!='complete_offline_successor_census': raise ValueError('ledger identity drifted')
 if ledger['parent_product']!={'pull_request':468,'head':PARENT_HEAD,'tree':PARENT_TREE,'base_capture_pull_request':409,'base_capture_head':'b996deefe04f73580bd5480bd4c388e6f313f02a'}: raise ValueError('parent product drifted')
 if ledger['input_custody']!={'capture_verification_artifact_id':8940053176,'capture_verification_artifact_digest':'sha256:b0fb0b27259349775b0d48b4eeab3024a5831139c05ebe58a3955aaf50d3e079','admission_finalizer_run_id':31034424330,'admission_artifact_id':8942065297,'admission_artifact_digest':'sha256:51f875f1c8159ae3cdb004071388ad38c51daac4b3dad11232a5157f6f13a3c6'}: raise ValueError('input custody drifted')
 if ledger['summary']!=EXPECTED_SUMMARY: raise ValueError('summary denominator drifted')
 if ledger['policy']!={'live_source_requests':0,'result_spawned_followups':0,'automatic_admission':False,'ordinal_unit_mapping_allowed':False,'candidate_route_is_evidence':False,'future_request_policy':{'authorized_now':False,'method':'GET','maximum_attempts':1,'timeout_ms':45000,'maximum_body_bytes':5242880,'concurrency':2,'automatic_second_pass':False,'result_spawned_followups':0}}: raise ValueError('policy drifted')
 if ledger['authority']!={'external_contacts':0,'external_reviews':0,'outside_human_dependency':False,'physical_user_action_required':False,'evidence_admissions':0,'chronology_resolutions':0,'classes_closed':0,'publication_effect':'none','adoption_effect':'none','graph_effect':'none','merge_authority':False}: raise ValueError('authority drifted')
 if len(ledger['objects'])!=9 or len(ledger['successor_routes'])!=28 or len(ledger['gap_register'])!=7: raise ValueError('major denominator drifted')
 for obj in ledger['objects']:
  exact_keys(obj,{'file','capture_object_id','source_route_id','cell_id','lane_id','source_url','sha256','bytes','refusal_class','anchor_count','unique_url_count','query_bearing_count','same_host_count','same_registrable_domain_count','https_count','http_count','anchor_observations_sha256'},f"object {obj.get('file')}")
  if not SHA256_RE.fullmatch(obj['sha256']) or not SHA256_RE.fullmatch(obj['anchor_observations_sha256']) or obj['bytes']<=0: raise ValueError('object custody shape drifted')
 ids=[r['candidate_id'] for r in ledger['successor_routes']]
 if ids!=[f'RD-W03-SUCC-{n:03d}' for n in range(1,29)]: raise ValueError('candidate order drifted')
 urls=[r['normalized_url'] for r in ledger['successor_routes']]
 if len(set(urls))!=28: raise ValueError('candidate URL duplicate')
 for route in ledger['successor_routes']:
  exact_keys(route,{'candidate_id','source_capture_object_id','source_file','source_body_sha256','source_body_bytes','source_route_id','source_cell_id','anchor_ordinal','anchor_text','original_href','absolute_url','normalized_url','route_class','lane_id','target_families','frozen_id_mapping_required','status','candidate_only_reason','automatic_admission'},f"route {route.get('candidate_id')}")
  parsed=urlparse(route['normalized_url'])
  if parsed.scheme!='https' or parsed.query or parsed.fragment or route['status']!='unexecuted_candidate' or route['automatic_admission'] is not False: raise ValueError('candidate authority or URL drifted')
 zero={g['gap_id'] for g in ledger['gap_register'] if g['direct_candidate_count']==0}
 if zero!={'RD04-AL-HEARING','RD04-AL-STAY','RD05-RECOMMENDATION','RD05-DISPOSITION'}: raise ValueError('zero-candidate gap register drifted')
 exact_keys(ledger['integrity'],set(EXPECTED_INTEGRITY),'integrity')
 if any(not isinstance(value,str) or not SHA256_RE.fullmatch(value) for value in ledger['integrity'].values()): raise ValueError('integrity digest shape drifted')
 recomputed=recompute_committed_integrity(ledger)
 if recomputed!=ledger['integrity']: raise ValueError('integrity self-hash drifted')
 if not allow_placeholders and recomputed!=EXPECTED_INTEGRITY: raise ValueError('integrity digest drifted')
 return True
def validate_manifest(root,manifest,ledger):
 exact_keys(manifest,{'schema_version','package_id','issue','parent_product','permanent_paths','hashes','summary','integrity','authority'},'manifest')
 if manifest['schema_version']!=1 or manifest['package_id']!='RD-W03-SUCCESSOR-ROUTE-PACKAGE-01' or manifest['issue']!=ISSUE: raise ValueError('manifest identity drifted')
 if manifest['parent_product']!={'pull_request':468,'head':PARENT_HEAD,'tree':PARENT_TREE} or manifest['summary']!=ledger['summary'] or manifest['integrity']!=ledger['integrity'] or manifest['authority']!=ledger['authority']: raise ValueError('manifest binding drifted')
 mp='data/research/residual-denominator/wave-03/successor-route-census/manifest.json'; expected=set(manifest['permanent_paths'])-{mp}
 if set(manifest['hashes'])!=expected: raise ValueError('manifest hash denominator drifted')
 for rel,digest in manifest['hashes'].items():
  if not SHA256_RE.fullmatch(digest) or sha256_bytes((root/rel).read_bytes())!=digest: raise ValueError(f'manifest hash mismatch: {rel}')
 return True
def main(argv=None):
 p=argparse.ArgumentParser(); p.add_argument('--check',action='store_true'); p.add_argument('--verify-inputs',action='store_true'); p.add_argument('--build',action='store_true'); p.add_argument('--capture-root',type=pathlib.Path); a=p.parse_args(argv)
 if a.build or a.verify_inputs:
  if a.capture_root is None:p.error('--capture-root is required with --build or --verify-inputs')
  regenerated=build_ledger(a.capture_root.resolve())
  if a.build: LEDGER_PATH.write_text(canonical_json(regenerated),encoding='utf-8')
  if a.verify_inputs and canonical_json(read_json(LEDGER_PATH))!=canonical_json(regenerated): raise ValueError('immutable body inputs do not regenerate committed ledger')
 ledger=read_json(LEDGER_PATH); validate_ledger(ledger); validate_manifest(ROOT,read_json(MANIFEST_PATH),ledger); schema=read_json(SCHEMA_PATH)
 if schema.get('additionalProperties') is not False or schema.get('properties',{}).get('successor_routes',{}).get('minItems')!=28: raise ValueError('closed schema drifted')
 print('PASS — RD-W03 successor-route census: 9 bodies, 785 anchors, 28 unexecuted candidates, zero requests/admissions/closures'); return 0
if __name__=='__main__':
 try: raise SystemExit(main())
 except Exception as error: print(f'rd-wave03-successor-route-census: {error}',file=sys.stderr); raise SystemExit(1)
