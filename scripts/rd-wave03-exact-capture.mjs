#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, '..');
export const PROTOCOL_PATH = 'data/research/residual-denominator/wave-03/exact-capture/protocol.json';
export const MANIFEST_PATH = 'data/research/residual-denominator/wave-03/exact-capture/manifest.json';
export const SCHEMA_PATH = 'schema/rd-wave03-exact-capture.schema.json';
export const DOC_PATH = 'docs/research/residual-denominator/wave-03/RD-EXACT-CAPTURE.md';
export const TEST_PATH = 'test/rd-wave03-exact-capture-adversarial.mjs';
export const SCRIPT_PATH = 'scripts/rd-wave03-exact-capture.mjs';
export const EXPECTED_PATHS = [PROTOCOL_PATH, MANIFEST_PATH, SCHEMA_PATH, SCRIPT_PATH, TEST_PATH, DOC_PATH];
export const EXPECTED_SELECTED = ['RD01-OFF-001','RD02-OFF-004','RD04-OFF-004','RD04-OFF-005','RD05-OFF-001','RD05-OFF-002','RD05-OFF-003','RD05-OFF-005','RD05-OFF-007'];
export const EXPECTED_COUNTS = Object.freeze({anomalous_cross_domain_redirect:2,candidate_search:659,capture_eligible:9,challenge_redirect:2,direct_non_200_pending:1,direct_non_2xx:9,official_search:28});

export function assert(condition, message) { if (!condition) throw new Error(message); }
export function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sortDeep(value) { if (Array.isArray(value)) return value.map(sortDeep); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep(value[key])])); return value; }
export function stableJson(value) { return `${JSON.stringify(sortDeep(value), null, 2)}\n`; }
function readText(root, rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function readJson(root, rel) { return JSON.parse(readText(root, rel)); }
function exactKeys(value, keys, scope) { assert(value && typeof value === 'object' && !Array.isArray(value), `${scope}: expected object`); const actual=Object.keys(value).sort(); const expected=[...keys].sort(); assert(JSON.stringify(actual)===JSON.stringify(expected), `${scope}: keys changed`); }
function deepKey(value) { return JSON.stringify(sortDeep(value)); }
function valueType(value) { if (value === null) return 'null'; if (Array.isArray(value)) return 'array'; if (typeof value === 'number') return Number.isInteger(value)?'integer':'number'; return typeof value; }
function resolveRef(schemaRoot, ref) { assert(ref.startsWith('#/'), `unsupported ref ${ref}`); return ref.slice(2).split('/').reduce((node,key)=>node[key.replaceAll('~1','/').replaceAll('~0','~')], schemaRoot); }
export function validateAgainstSchema(value, schema, schemaRoot=schema, scope='$') {
  if (schema.$ref) return validateAgainstSchema(value, resolveRef(schemaRoot, schema.$ref), schemaRoot, scope);
  const types=schema.type===undefined?null:(Array.isArray(schema.type)?schema.type:[schema.type]);
  if (types) { const actual=valueType(value); assert(types.includes(actual)||(actual==='integer'&&types.includes('number')), `${scope}: type ${actual} not in ${types.join('|')}`); }
  if (Object.hasOwn(schema,'const')) assert(deepKey(value)===deepKey(schema.const), `${scope}: const changed`);
  if (schema.enum) assert(schema.enum.some(candidate=>deepKey(candidate)===deepKey(value)), `${scope}: enum mismatch`);
  if (typeof value==='string') { if (schema.minLength!==undefined) assert(value.length>=schema.minLength, `${scope}: string too short`); if (schema.pattern!==undefined) assert(new RegExp(schema.pattern).test(value), `${scope}: pattern mismatch`); }
  if (typeof value==='number') { if (schema.minimum!==undefined) assert(value>=schema.minimum, `${scope}: below minimum`); if (schema.maximum!==undefined) assert(value<=schema.maximum, `${scope}: above maximum`); }
  if (Array.isArray(value)) { if (schema.minItems!==undefined) assert(value.length>=schema.minItems, `${scope}: too few items`); if (schema.maxItems!==undefined) assert(value.length<=schema.maxItems, `${scope}: too many items`); if (schema.uniqueItems) assert(new Set(value.map(deepKey)).size===value.length, `${scope}: duplicate items`); if (schema.items) value.forEach((item,i)=>validateAgainstSchema(item,schema.items,schemaRoot,`${scope}[${i}]`)); }
  if (value && typeof value==='object' && !Array.isArray(value)) { const props=schema.properties||{}; for (const key of schema.required||[]) assert(Object.hasOwn(value,key), `${scope}: missing ${key}`); if (schema.additionalProperties===false) for (const key of Object.keys(value)) assert(Object.hasOwn(props,key), `${scope}: extra ${key}`); for (const [key,child] of Object.entries(props)) if (Object.hasOwn(value,key)) validateAgainstSchema(value[key],child,schemaRoot,`${scope}.${key}`); }
  return value;
}
export function normalizedHost(value) { const host=new URL(value).hostname.toLowerCase().replace(/\.$/,''); return host.startsWith('www.')?host.slice(4):host; }
export function classifyObservation(row) {
  const req=new URL(row.requested_url).hostname.toLowerCase(); const fin=row.final_url?new URL(row.final_url).hostname.toLowerCase():null;
  if (row.route_class==='candidate') return 'candidate_search';
  if (req==='search.usa.gov') return 'official_search';
  if ([403,404].includes(row.http_status)) return 'direct_non_2xx';
  if (row.http_status===202) return 'direct_non_200_pending';
  if (fin==='unblock.federalregister.gov') return 'challenge_redirect';
  if (normalizedHost(row.requested_url)!==normalizedHost(row.final_url)) return 'anomalous_cross_domain_redirect';
  if (EXPECTED_SELECTED.includes(row.route_id)) return 'capture_eligible';
  throw new Error(`unclassified route ${row.route_id}`);
}
function lineHash(values) { return sha256(`${values.join('\n')}\n`); }
function identityLine(o) { return [o.lane_id,o.source_product_head,String(o.source_product_pr),String(o.source_workflow_run_id),o.route_id,o.requested_url,o.final_url||'',String(o.http_status||''),o.body_sha256||'',o.capture_classification].join('|'); }
export function validateProtocol(protocol, {root=DEFAULT_ROOT}={}) {
  const schema=readJson(root,SCHEMA_PATH); validateAgainstSchema(protocol,schema,schema,'$');
  assert(JSON.stringify(protocol.permanent_paths)===JSON.stringify(EXPECTED_PATHS), 'permanent paths changed');
  assert(protocol.source_frontier.repository==='BigBirdReturns/undercast', 'repository changed');
  assert(protocol.source_frontier.lane_base==='318e7fd2826511c283e2d81622459fe0bb74e0d2', 'lane base changed');
  assert(protocol.source_frontier.lanes.length===6, 'lane count changed');
  assert(JSON.stringify(protocol.source_frontier.lanes.map(l=>l.head))===JSON.stringify(['7f00c571c96f393a8cf15f052c151992edb1a961','55a69c566270b01e35587123daff42808f48e3dd','7d6366cab76bbfe4106e4ece7ebe30f1c5211f37','4b4f3d44c4926c6961e1e7f1ebe982acee6c2c9c','b472a5bdcc737e0a6b1b55f6087fb4e0f10aaed6','7433646fa8101290427548512bcec4dc29d60bc7']), 'lane heads changed');
  assert(JSON.stringify(protocol.source_frontier.lanes.map(l=>l.pull_request))===JSON.stringify([372,373,374,375,376,377]), 'lane PRs changed');
  assert(JSON.stringify(protocol.source_frontier.lanes.map(l=>l.workflow_run))===JSON.stringify([30984441377,30984459798,30984486686,30984497436,30984516496,30984537874]), 'lane runs changed');
  assert(protocol.source_frontier.lanes.every(l=>l.parent==='318e7fd2826511c283e2d81622459fe0bb74e0d2'), 'lane parent changed');
  assert(protocol.source_frontier.lanes.reduce((n,l)=>n+l.frozen_units,0)===101, 'unit denominator changed');
  assert(protocol.source_frontier.lanes.reduce((n,l)=>n+l.route_count,0)===710, 'route denominator changed');
  assert(protocol.source_frontier.lanes.reduce((n,l)=>n+l.required_cells,0)===959, 'cell denominator changed');
  assert(protocol.source_frontier.lanes.reduce((n,l)=>n+l.adversarial_refusals,0)===267, 'source refusal denominator changed');
  const observations=protocol.observation_census.observations; assert(observations.length===710, 'observation denominator changed');
  assert(new Set(observations.map(o=>o.route_id)).size===710, 'duplicate route identity');
  const counts=Object.fromEntries(Object.keys(EXPECTED_COUNTS).map(key=>[key,0]));
  for (const o of observations) { assert(o.attempt_count===1 && o.followups_spawned===0 && o.evidence_admitted===false && o.body_limit_exceeded===false, `route policy changed ${o.route_id}`); const derived=classifyObservation(o); assert(o.capture_classification===derived, `classification changed ${o.route_id}`); counts[derived]+=1; }
  assert(deepKey(counts)===deepKey(EXPECTED_COUNTS), 'classification counts changed');
  assert(deepKey(protocol.observation_census.classification_counts)===deepKey(EXPECTED_COUNTS), 'declared classification counts changed');
  assert(protocol.observation_census.observation_identity_sha256===lineHash(observations.map(identityLine)), 'observation identity hash changed');
  const selected=observations.filter(o=>o.capture_classification==='capture_eligible');
  assert(JSON.stringify(selected.map(o=>o.route_id))===JSON.stringify(EXPECTED_SELECTED), 'selected route order changed');
  assert(protocol.selection.selected_route_ids_sha256===lineHash(EXPECTED_SELECTED), 'selected route hash changed');
  assert(protocol.selection.captures.length===9, 'capture denominator changed');
  for (let i=0;i<9;i+=1) { const c=protocol.selection.captures[i], o=selected[i]; assert(c.capture_object_id===`RD-W03-XCAP-01-${String(i+1).padStart(2,'0')}`, 'object id changed'); assert(c.source_route_id===o.route_id && c.cell_id===o.cell_id && c.source_product_head===o.source_product_head && c.source_workflow_run_id===o.source_workflow_run_id, `source binding changed ${o.route_id}`); assert(c.requested_url===o.requested_url, `requested URL changed ${o.route_id}`); assert(c.allowed_final_hosts.length===1 && c.allowed_final_hosts[0]===normalizedHost(o.final_url), `allowed host changed ${o.route_id}`); assert(c.initial_observation.body_sha256===o.body_sha256 && c.initial_observation.bytes===o.bytes && c.initial_observation.final_url===o.final_url, `initial fingerprint changed ${o.route_id}`); assert(c.chronology.status==='unresolved' && c.chronology.event_date===null && c.evidence_admitted===false && c.closure_eligible===false, `authority promoted ${o.route_id}`); }
  assert(protocol.request_policy.method==='GET' && protocol.request_policy.maximum_attempts===1 && protocol.request_policy.timeout_ms===45000 && protocol.request_policy.maximum_body_bytes===5242880 && protocol.request_policy.concurrency===2 && protocol.request_policy.automatic_second_pass===false && protocol.request_policy.result_spawned_followups===0, 'request policy changed');
  assert(protocol.admission.capture_is_evidence===false && protocol.admission.admitted_objects===0, 'admission changed');
  assert(protocol.authority.external_contacts===0 && protocol.authority.external_reviews===0 && protocol.authority.outside_human_dependency===false && protocol.authority.physical_user_action_required===false && protocol.authority.merge_authority===false, 'outside authority changed');
  assert(protocol.closure.classes_closed===0 && protocol.closure.allow_at_capture===false, 'closure changed');
  return protocol;
}
export function validateRoot(root=DEFAULT_ROOT) {
  const protocol=readJson(root,PROTOCOL_PATH); validateProtocol(protocol,{root});
  const manifest=readJson(root,MANIFEST_PATH); exactKeys(manifest,['authority','hashes','identity_sha256','package_id','permanent_paths','schema_version'],'manifest');
  assert(manifest.schema_version===1 && manifest.package_id==='RD-W03-EXACT-CAPTURE-PACKAGE-01', 'manifest identity changed');
  assert(JSON.stringify(manifest.permanent_paths)===JSON.stringify(EXPECTED_PATHS), 'manifest paths changed');
  const hashPaths=EXPECTED_PATHS.filter(rel=>rel!==MANIFEST_PATH); exactKeys(manifest.hashes,hashPaths,'manifest.hashes');
  for (const rel of hashPaths) assert(sha256(fs.readFileSync(path.join(root,rel)))===manifest.hashes[rel], `manifest hash changed ${rel}`);
  assert(manifest.identity_sha256===lineHash(hashPaths.map(rel=>`${rel}\t${manifest.hashes[rel]}`)), 'manifest identity hash changed');
  assert(manifest.authority.evidence_admissions===0 && manifest.authority.classes_closed===0 && manifest.authority.outside_human_dependency===false, 'manifest authority changed');
  return {protocol,manifest};
}
export function derivePlan(root=DEFAULT_ROOT) { const {protocol}=validateRoot(root); return {schema_version:1,capture_id:protocol.capture_id,request_policy:protocol.request_policy,objects:protocol.selection.captures,authority:protocol.authority,admission:protocol.admission,closure:protocol.closure}; }
async function readBounded(response, maximum) { assert(response.body,'response body missing'); const reader=response.body.getReader(); const chunks=[]; let bytes=0; while(true){const {value,done}=await reader.read(); if(done)break; bytes+=value.byteLength; if(bytes>maximum){await reader.cancel('maximum body exceeded'); throw new Error(`body limit exceeded at ${bytes}`);} chunks.push(Buffer.from(value));} return Buffer.concat(chunks); }
async function captureOne(object, policy, out) { const started_at=new Date().toISOString(); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(new Error('timeout')),policy.timeout_ms); try { const response=await fetch(object.requested_url,{method:'GET',redirect:'follow',signal:controller.signal,headers:{accept:'text/html,application/json,application/pdf;q=0.9,*/*;q=0.1','user-agent':'UnderCast-RD-W03-exact-capture'}}); assert(response.status===200,`HTTP ${response.status}`); const final_url=response.url||object.requested_url; assert(object.allowed_final_hosts.includes(normalizedHost(final_url)),`unexpected final host ${normalizedHost(final_url)}`); const body=await readBounded(response,policy.maximum_body_bytes); const relative_path=object.output_path; const target=path.join(out,relative_path); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,body); return {ok:true,capture_object_id:object.capture_object_id,source_route_id:object.source_route_id,lane_id:object.lane_id,unit_id:object.unit_id,event_class:object.event_class,cell_id:object.cell_id,requested_url:object.requested_url,final_url,http_status:response.status,content_type:response.headers.get('content-type'),bytes:body.length,body_sha256:sha256(body),initial_bytes:object.initial_observation.bytes,initial_body_sha256:object.initial_observation.body_sha256,body_drift:body.length!==object.initial_observation.bytes||sha256(body)!==object.initial_observation.body_sha256,relative_path,started_at,finished_at:new Date().toISOString(),attempt_count:1,followups_spawned:0,chronology:{status:'unresolved',event_date:null,capture_time_is_event_time:false},evidence_admitted:false,classes_closed:0}; } catch(error) { return {ok:false,capture_object_id:object.capture_object_id,source_route_id:object.source_route_id,requested_url:object.requested_url,error_class:error?.name||'Error',error_message:String(error?.message||error),started_at,finished_at:new Date().toISOString(),attempt_count:1,followups_spawned:0,evidence_admitted:false,classes_closed:0}; } finally { clearTimeout(timer); } }
export async function executePlan(root,out) { const plan=derivePlan(root); fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true}); const results=new Array(plan.objects.length); let cursor=0; async function worker(){while(true){const i=cursor++; if(i>=plan.objects.length)return; results[i]=await captureOne(plan.objects[i],plan.request_policy,out);}} await Promise.all(Array.from({length:plan.request_policy.concurrency},()=>worker())); const receipt={schema_version:1,capture_id:plan.capture_id,exact_product_head:process.env.GITHUB_SHA||null,workflow_run_id:process.env.GITHUB_RUN_ID||null,started_at:results[0]?.started_at||new Date().toISOString(),finished_at:new Date().toISOString(),object_count:results.length,objects:results,summary:{successful:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,unchanged:results.filter(r=>r.ok&&!r.body_drift).length,drifted:results.filter(r=>r.ok&&r.body_drift).length,evidence_admissions:0,chronology_resolved:0,classes_closed:0},authority:plan.authority}; fs.writeFileSync(path.join(out,'receipt.json'),stableJson(receipt)); fs.writeFileSync(path.join(out,'plan.json'),stableJson(plan)); if(receipt.summary.failed) throw new Error(`${receipt.summary.failed} exact-capture requests failed`); verifyReceiptObject(receipt,root,out); return receipt; }
export function verifyReceiptObject(receipt,root=DEFAULT_ROOT,out=null) { const plan=derivePlan(root); assert(receipt.schema_version===1&&receipt.capture_id==='RD-W03-XCAP-01','receipt identity changed'); assert(receipt.object_count===9&&receipt.objects.length===9,'receipt denominator changed'); for(let i=0;i<9;i+=1){const row=receipt.objects[i], object=plan.objects[i]; assert(row.ok===true&&row.capture_object_id===object.capture_object_id&&row.source_route_id===object.source_route_id,'receipt object changed'); assert(row.http_status===200&&row.attempt_count===1&&row.followups_spawned===0,'receipt request policy changed'); assert(object.allowed_final_hosts.includes(normalizedHost(row.final_url)),'receipt final host changed'); assert(row.evidence_admitted===false&&row.classes_closed===0&&row.chronology.status==='unresolved','receipt authority promoted'); if(out){const body=fs.readFileSync(path.join(out,row.relative_path)); assert(body.length===row.bytes&&sha256(body)===row.body_sha256,`receipt bytes changed ${row.source_route_id}`);}} assert(receipt.summary.successful===9&&receipt.summary.failed===0&&receipt.summary.evidence_admissions===0&&receipt.summary.chronology_resolved===0&&receipt.summary.classes_closed===0,'receipt summary changed'); return receipt; }
export function verifyReceiptFile(file,root=DEFAULT_ROOT){const receipt=JSON.parse(fs.readFileSync(file,'utf8')); return verifyReceiptObject(receipt,root,path.dirname(file));}
function parseArgs(argv){let mode='check',out=null,receipt=null,seen=false; for(let i=0;i<argv.length;i+=1){const arg=argv[i]; if(['--check','--print','--execute'].includes(arg)){assert(!seen,'choose one mode');mode=arg.slice(2);seen=true;} else if(arg==='--verify-receipt'){assert(!seen,'choose one mode');receipt=path.resolve(argv[++i]);mode='verify-receipt';seen=true;} else if(arg==='--out'){out=path.resolve(argv[++i]);} else throw new Error(`unknown argument ${arg}`);} if(mode==='execute')assert(out,'--execute requires --out'); return {mode,out,receipt};}
async function main(){const {mode,out,receipt}=parseArgs(process.argv.slice(2)); if(mode==='check'){const first=stableJson(derivePlan());const second=stableJson(derivePlan());assert(first===second,'deterministic plan drift');console.log('RD-W03 exact-capture package: passed (710 observations, 9 objects, 35 refusal fixtures external)');return;} if(mode==='print'){process.stdout.write(stableJson(derivePlan()));return;} if(mode==='verify-receipt'){const r=verifyReceiptFile(receipt);console.log(`RD-W03 exact-capture receipt: passed (${r.object_count} objects, ${r.summary.drifted} body drifts, 0 admissions, 0 closures)`);return;} const r=await executePlan(DEFAULT_ROOT,out);console.log(`RD-W03 exact capture: completed (${r.object_count} objects, ${r.summary.drifted} body drifts, 0 admissions, 0 closures)`);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(`RD-W03 exact-capture: ${error.message}`);process.exit(1);});
