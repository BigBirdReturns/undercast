#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-174-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-174-render';
const PACKET = join(OUT, 'UC-174');
const WORK = join(OUT, 'work');
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive:true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
function identify(path) {
  const text = execFileSync(process.env.MAGICK_CMD || 'magick', ['identify','-format','%w %h',path], { encoding:'utf8' }).trim();
  const [width,height] = text.split(/\s+/).map(Number);
  assert(width > 0 && height > 0, `cannot identify ${path}`);
  return { width, height };
}
function magick(...args) { execFileSync(process.env.MAGICK_CMD || 'magick', args, { stdio:'inherit' }); }
async function walkImages(root, out = []) {
  let entries; try { entries = await readdir(root, { withFileTypes:true }); } catch { return out; }
  for (const entry of entries) { const path = join(root, entry.name); if (entry.isDirectory()) await walkImages(path, out); else if (/\.(?:jpe?g|png|webp)$/i.test(entry.name)) out.push(path); }
  return out;
}
async function repositoryHashes() {
  const map = new Map();
  try { const manifest = await readJson('data/media-manifest.json'); for (const [path,row] of Object.entries(manifest.assets || {})) { if (!/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) continue; const list = map.get(row.sha256) || []; list.push(`manifest:${path}`); map.set(row.sha256, list); } } catch {}
  for (const path of await walkImages('images')) { try { const hash = sha(await readFile(path)); const list = map.get(hash) || []; list.push(`file:${path}`); map.set(hash, list); } catch {} }
  return map;
}
async function receipt(path, expected = {}) {
  const bytes = await readFile(path); const mime = signatureMime(bytes); const image = mime !== 'unknown';
  const row = { bytes:bytes.length, sha256:sha(bytes), mime, ...(image ? identify(path) : {}) };
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.mime) assert(row.mime === expected.mime, `${path} MIME drift ${row.mime}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
async function retain(inputRel, outputName, expected = {}) {
  const output = join(PACKET, outputName); await copyFile(join(SOURCE_ROOT, inputRel), output); return { path:outputName, ...(await receipt(output, expected)) };
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-174', 'UC-174 render scope drift');
assert(control.kind === 'voice' && control.actor === 'John DiMaggio' && control.character === 'Bender, Jake the Dog, Marcus Fenix' && control.production === 'Futurama / Adventure Time / Gears of War' && control.years === '1990s–' && control.side === 'still', 'UC-174 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8734052507 && control.discovery_artifact?.head_sha === '71386d89beeb5c498a3fb33c19ca80f862dab459' && control.discovery_artifact?.candidate_count === 43, 'UC-174 discovery custody drift');
assert(control.failed_discovery_checkpoints?.length === 1 && control.identity_custody?.length === 4 && control.roles?.length === 3, 'UC-174 render denominator drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.panel_width === 412 && control.render?.divider_width === 12 && control.render?.face_height === 560 && control.render?.internal_rule_height === 8 && control.render?.body_height === 432, 'UC-174 render geometry drift');
await mkdir(PACKET, { recursive:true }); await mkdir(WORK, { recursive:true });

const discoveryManifestReceipt = await receipt(join(SOURCE_ROOT,'manifest.json'), { sha256:control.discovery_artifact.manifest_sha256, bytes:control.discovery_artifact.manifest_bytes });
const discoverySummaryReceipt = await receipt(join(SOURCE_ROOT,'summary.json'), { sha256:control.discovery_artifact.summary_sha256, bytes:control.discovery_artifact.summary_bytes });
const discoveryContactReceipt = await receipt(join(SOURCE_ROOT,'contact-sheet-all-roles.jpg'), { sha256:control.discovery_artifact.contact_sheet_sha256, bytes:control.discovery_artifact.contact_sheet_bytes, mime:'image/jpeg', width:1632, height:644 });
const discoveryManifest = await readJson(join(SOURCE_ROOT,'manifest.json'));
const discoverySummary = await readJson(join(SOURCE_ROOT,'summary.json'));
assert(discoveryManifest.record_id === 'UC-174' && discoveryManifest.actor === 'John DiMaggio' && discoveryManifest.character === 'Bender, Jake the Dog, Marcus Fenix' && discoveryManifest.side === 'still', 'UC-174 discovery manifest identity drift');
assert(discoveryManifest.candidate_count === 43 && JSON.stringify(discoveryManifest.role_counts) === JSON.stringify({bender:2,jake:24,marcus:17}), 'UC-174 discovery manifest denominator drift');
assert(discoverySummary.candidate_count === 43 && JSON.stringify(discoverySummary.role_counts) === JSON.stringify({bender:2,jake:24,marcus:17}), 'UC-174 discovery summary denominator drift');
assert(discoveryManifest.failed_discovery_checkpoints?.length === 1 && discoverySummary.failed_discovery_checkpoints?.length === 1, 'UC-174 failed discovery custody missing');
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const identityRows = [];
for (const spec of control.identity_custody) {
  const evidence = discoveryManifest.page_evidence?.[spec.key];
  assert(evidence?.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${spec.key} strict transport drift`);
  assert(evidence.title === spec.page_title && evidence.body_sha256 === spec.body_sha256 && evidence.required_terms_missing.length === 0, `${spec.key} strict evidence drift`);
  const screenshot = await retain(spec.artifact_path, spec.output_path, { sha256:spec.sha256, mime:'image/png', bytes:spec.bytes, width:spec.width, height:spec.height });
  identityRows.push({ spec, evidence, screenshot });
}

const roleRows = [];
for (const spec of control.roles) {
  const candidate = (discoveryManifest.candidates || []).find(row => row.role_key === spec.key && row.sha256 === spec.sha256);
  assert(candidate, `${spec.key} selected candidate missing`);
  assert(candidate.file_title === spec.file_title && candidate.local === spec.artifact_path && candidate.pageimage_source === spec.pageimage_source && candidate.width === spec.width && candidate.height === spec.height && candidate.bytes === spec.bytes && candidate.mime === spec.mime, `${spec.key} selected candidate drift`);
  assert(Array.isArray(candidate.repository_matches) && candidate.repository_matches.length === 0, `${spec.key} repository duplicate drift`);
  const rolePage = discoveryManifest.role_pages?.[spec.key];
  assert(rolePage && rolePage.raw_revision_sha256 === spec.raw_sha256 && rolePage.primary_api_sha256 === spec.primary_api_sha256, `${spec.key} role-page custody drift`);
  assert(!(repository.get(spec.sha256) || []).length, `${spec.key} selected source duplicates canonical media`);
  const source = await retain(spec.artifact_path, spec.output_path, { sha256:spec.sha256, mime:spec.mime, bytes:spec.bytes, width:spec.width, height:spec.height });
  const raw = await retain(spec.raw_artifact_path, spec.raw_output_path, { sha256:spec.raw_sha256, bytes:spec.raw_bytes });
  const primaryApi = await retain(spec.primary_api_artifact_path, spec.primary_api_output_path, { sha256:spec.primary_api_sha256, bytes:spec.primary_api_bytes });
  const imageApi = await retain(spec.image_api_artifact_path, spec.image_api_output_path, { sha256:spec.image_api_sha256, bytes:spec.image_api_bytes });
  roleRows.push({ spec, candidate, rolePage, source, raw, primaryApi, imageApi });
}

const exactVoiceRecord = {
  version:1, record_id:'UC-174', kind:'voice', actor:'John DiMaggio', character:'Bender, Jake the Dog, Marcus Fenix', production:'Futurama / Adventure Time / Gears of War', canonical_years:'1990s–', side:'still', expected_subject:'Bender, Jake the Dog, Marcus Fenix',
  chronology_boundary:{
    bender:'Futurama original television production beginning in 1999.',
    jake:'Adventure Time animated television role performed by John DiMaggio.',
    marcus:'Gears of War video-game role performed by John DiMaggio.',
    canonical_years_semantics:'1990s– is a broad John DiMaggio career envelope and is not a shared role-debut date.',
    cross_medium_separation_required:true,
    replacement_performers_and_other_continuities_forbidden:true
  },
  actor_role_bindings:Object.fromEntries(identityRows.map(({spec,evidence,screenshot}) => [spec.key, { provider:spec.provider, source_page:spec.page_url, binding:spec.binding, strict:true, page_title:evidence.title, body_sha256:evidence.body_sha256, page_screenshot_sha256:screenshot.sha256 }])),
  roles:Object.fromEntries(roleRows.map(({spec,source,raw,primaryApi,imageApi}) => [spec.key, { role:spec.role, display_label:spec.display_label, source_page:spec.source_page, file_title:spec.file_title, selected_image:source, raw_revision:raw, primary_api_receipt:primaryApi, image_api_receipt:imageApi, pageimage_source:spec.pageimage_source, chronology:spec.chronology, selection_ruling:spec.selection_ruling }])),
  composite_boundary:{ required_roles:['bender','jake','marcus'], all_three_faces_bodies_and_design_silhouettes_must_be_legible:true, live_action_costume_merchandise_toy_cosplay_poster_and_generic_ensemble_forbidden:true, existing_performer_portrait:'images/uc-174-portrait.jpg', existing_performer_portrait_must_remain_unchanged:true },
  failed_discovery_checkpoints:control.failed_discovery_checkpoints,
  canonical_mutation:false
};
await writeJson(join(PACKET,'exact-voice-record.json'), exactVoiceRecord);
const voiceRecordReceipt = await receipt(join(PACKET,'exact-voice-record.json'));

async function renderPanel(row) {
  const key = row.spec.key;
  const face = join(WORK,`${key}-face.png`), body = join(WORK,`${key}-body.png`), rule = join(WORK,`${key}-rule.png`), panel = join(WORK,`${key}-panel.png`);
  magick(join(PACKET,row.source.path),'-auto-orient','-filter',control.render.filter,'-resize',`${control.render.panel_width}x${control.render.face_height}^`,'-gravity',control.render.face_gravity[key],'-background',control.render.background,'-extent',`${control.render.panel_width}x${control.render.face_height}`,'-flatten',face);
  magick(join(PACKET,row.source.path),'-auto-orient','-filter',control.render.filter,'-resize',`${control.render.body_box.width}x${control.render.body_box.height}`,'-gravity','center','-background',control.render.background,'-extent',`${control.render.panel_width}x${control.render.body_height}`,'-flatten',body);
  magick('-size',`${control.render.panel_width}x${control.render.internal_rule_height}`,`xc:${control.render.divider}`,rule);
  magick(face,rule,body,'-append',panel);
  assert(identify(panel).width === control.render.panel_width && identify(panel).height === control.render.panel_height, `${key} panel geometry drift`);
  return panel;
}
const panels=[]; for (const row of roleRows) panels.push(await renderPanel(row));
const divider=join(WORK,'divider.png'); magick('-size',`${control.render.divider_width}x${control.render.panel_height}`,`xc:${control.render.divider}`,divider);
const candidatePath=join(PACKET,'uc-174-still-candidate.jpg');
magick(panels[0],divider,panels[1],divider,panels[2],'+append','-strip','-quality',String(control.render.jpeg_quality),candidatePath);
const candidate={path:'uc-174-still-candidate.jpg',...(await receipt(candidatePath,{mime:'image/jpeg',width:1260,height:1000}))};
const cropPath=join(PACKET,'card-crop-preview.jpg');
magick(candidatePath,'-gravity',control.render.wall_gravity,'-crop',`${control.render.wall_width}x${control.render.wall_height}+0+0`,'+repage','-strip','-quality',String(control.render.jpeg_quality),cropPath);
const cropPreview={path:'card-crop-preview.jpg',...(await receipt(cropPath,{mime:'image/jpeg',width:1246,height:1000}))};

const duplicateItems=[...roleRows.map(({spec,source})=>({label:`${spec.display_label} selected source`,path:source.path,sha256:source.sha256,matches:repository.get(source.sha256)||[]})),{label:'UC-174 three-role candidate',path:candidate.path,sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]},{label:'UC-174 wall crop preview',path:cropPreview.path,sha256:cropPreview.sha256,matches:repository.get(cropPreview.sha256)||[]}];
assert(duplicateItems.every(item=>item.matches.length===0),'UC-174 exact-byte duplicate detected');
await writeJson(join(PACKET,'duplicate-scan.json'),{version:1,repository_hash_count:repository.size,items:duplicateItems,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,status:'pass',semantics:'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'});

const notes=[
  'Disney+ and Hulu establish John DiMaggio as Bender in Futurama. Warner Bros. Discovery identifies him as Jake in Adventure Time. Xbox Wire explicitly identifies him as the voice of Marcus Fenix in Gears of War.',
  'The canonical 1990s– value is a broad John DiMaggio career envelope. The packet retains separate Bender, Jake, and Marcus production and medium boundaries rather than assigning them a common debut date.',
  'The first discovery attempt failed closed because the Disney+ article no longer contained a retired Planet Express assertion. The repaired run retained the source and narrowed the assertion to its exact current Bender language.',
  'The selected Bender page image preserves the antenna, eyes, mouth, torso hatch, segmented limbs, hands, and feet without Fry, another robot, merchandise, or an ensemble.',
  'The selected Jake page image preserves the ears, eyes, muzzle, nose, torso, arms, hands, tail, legs, and feet without Finn, another dog, a costume, game image, or ensemble.',
  'The selected Marcus UE object preserves the bandana, face, armour, chest emblem, arms, gloves, rifle, legs, knee armour, and boots. It is selected over the later chest-only page image because the final card requires the complete game-character silhouette.',
  'Each panel contains a 560-pixel face region and a 432-pixel full-source region separated by an eight-pixel rule. Twelve-pixel dividers prevent role bleed-through.',
  'The 1246x1000 wall simulation removes seven pixels from each outside dark field without changing any face, body, role, medium, chronology, or source-edge ruling.',
  'The existing John DiMaggio performer portrait remains unchanged and outside the still packet’s asserted object.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review={version:1,record_id:'UC-174',kind:'voice',actor:'John DiMaggio',character:'Bender, Jake the Dog, Marcus Fenix',production:'Futurama / Adventure Time / Gears of War',years:'1990s–',side:'still',expected_subject:'Bender, Jake the Dog, Marcus Fenix',source_sha256:Object.fromEntries(roleRows.map(({spec,source})=>[spec.key,source.sha256])),exact_voice_record_sha256:voiceRecordReceipt.sha256,candidate_sha256:candidate.sha256,crop_preview_sha256:cropPreview.sha256,identity_ruling:'exact-three-role-subject-set',presentation_ruling:'three-role-cross-medium-character-composite',crop_ruling:'pass-face-and-full-source-triptych',chronology_ruling:'pass-role-specific-production-medium-and-career-envelope',marcus_selection_ruling:'pass-full-body-object-over-chest-only-pageimage',portrait_separation_ruling:'pass-existing-performer-portrait-unchanged',reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:'reviewed-evidence-candidate',notes};
await writeJson(join(PACKET,'review.json'),review);
const reviewMd=`# UC-174 reviewed John DiMaggio three-role still candidate\n\n- **Record:** UC-174\n- **Performer:** John DiMaggio\n- **Displayed roles:** Bender, Jake the Dog, Marcus Fenix\n- **Production envelope:** Futurama / Adventure Time / Gears of War\n- **Exact voice record:** \`${voiceRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** exact three-role subject set\n- **Presentation ruling:** three-role cross-medium character composite\n- **Crop ruling:** pass, face and full-source triptych\n- **Chronology ruling:** role-specific production, medium, and career-envelope separation passes\n- **Marcus ruling:** full-body object selected over chest-only page image\n- **Portrait separation:** existing John DiMaggio portrait remains unchanged\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note=>`- ${note}`).join('\n')}\n\nThe selected role bytes, raw revisions, API receipts, four official page receipts, retained failure checkpoint, deterministic triptych, wall simulation, duplicate receipt, and exact voice record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET,'review.md'),reviewMd);

const manifest={version:1,lane:'card-backfill',record_id:'UC-174',kind:'voice',actor:'John DiMaggio',character:'Bender, Jake the Dog, Marcus Fenix',production:'Futurama / Adventure Time / Gears of War',years:'1990s–',side:'still',expected_subject:'Bender, Jake the Dog, Marcus Fenix',reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{discovery_artifact:control.discovery_artifact,failed_discovery_checkpoints:control.failed_discovery_checkpoints,discovery_repair_boundary:control.discovery_repair_boundary,render_control_sha256:sha(await readFile(CONTROL)),discovery_manifest_sha256:discoveryManifestReceipt.sha256,discovery_summary_sha256:discoverySummaryReceipt.sha256,discovery_contact_sheet_sha256:discoveryContactReceipt.sha256,render_artifact:null,apply_control_sha256:null},actor_role_custody:Object.fromEntries(identityRows.map(({spec,evidence,screenshot})=>[spec.key,{provider:spec.provider,source_page:spec.page_url,binding:spec.binding,strict:true,page_title:evidence.title,body_sha256:evidence.body_sha256,page_screenshot:screenshot}])),chronology_boundary:exactVoiceRecord.chronology_boundary,composite_boundary:exactVoiceRecord.composite_boundary,roles:Object.fromEntries(roleRows.map(({spec,source,raw,primaryApi,imageApi})=>[spec.key,{role:spec.role,display_label:spec.display_label,provider:spec.provider,source_page:spec.source_page,file_title:spec.file_title,original_url:spec.original_url,original:source,raw_revision:raw,primary_api_receipt:primaryApi,image_api_receipt:imageApi,pageimage_source:spec.pageimage_source,chronology:spec.chronology,selection_ruling:spec.selection_ruling}])),exact_voice_record:{path:'exact-voice-record.json',...voiceRecordReceipt},candidate:{...candidate,recipe:`Three ${control.render.panel_width}x${control.render.panel_height} panels; ${control.render.face_height}px face cover; ${control.render.internal_rule_height}px rule; ${control.render.body_height}px centered full-source view; ${control.render.divider_width}px dividers; ${control.render.filter}; JPEG quality ${control.render.jpeg_quality}`},crop_preview:{...cropPreview,gravity:control.render.wall_gravity,semantics:'The wall simulation removes seven pixels from each outside dark field while preserving all three faces, full-source regions, role, medium, chronology, and source-edge boundaries.'},rejected_orbit_summary:['Other Futurama robots, other Adventure Time characters, other COG soldiers, replacement performers, live action, costumes, toys, cosplay, posters, and incomplete composites remain outside the evidence boundary.','The later Marcus chest-only page image is retained in discovery but rejected in favor of the full-body Marcus UE object.','The first Disney+ term checkpoint remains visible and did not silently authorize a candidate.'],duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},exact_subject_review:{identity:review.identity_ruling,presentation:review.presentation_ruling,crop_ruling:review.crop_ruling,chronology_ruling:review.chronology_ruling,marcus_selection_ruling:review.marcus_selection_ruling,portrait_separation_ruling:review.portrait_separation_ruling,notes},disposition:'reviewed-evidence-candidate',canonical_mutation:false};
await writeJson(join(PACKET,'manifest.json'),manifest);
const packetNames=['card-crop-preview.jpg','duplicate-scan.json','exact-voice-record.json','manifest.json','review.json','review.md','bender-original.webp','jake-original.webp','marcus-original.webp','source-raw-bender.wikitext','source-raw-jake.wikitext','source-raw-marcus.wikitext','source-api-bender-primary.json','source-api-jake-primary.json','source-api-marcus-primary.json','source-api-bender-image.json','source-api-jake-image.json','source-api-marcus-image.json','source-page-disneyplus-bender.png','source-page-hulu-futurama.png','source-page-wbd-adventure-time.png','source-page-xbox-gears4-marcus.png','uc-174-still-candidate.jpg'];
const sums=[];for(const name of packetNames)sums.push(`${sha(await readFile(join(PACKET,name)))}  ${name}`);await writeFile(join(PACKET,'SHA256SUMS'),sums.join('\n')+'\n');
await writeJson(join(OUT,'render-summary.json'),{record_id:'UC-174',sources:Object.fromEntries(roleRows.map(({spec,source})=>[spec.key,source])),exact_voice_record:{path:'exact-voice-record.json',...voiceRecordReceipt},candidate,crop_preview:cropPreview,strict_identity_pages:Object.fromEntries(identityRows.map(({spec,screenshot})=>[spec.key,screenshot])),repository_hash_count:repository.size,failed_discovery_checkpoints:control.failed_discovery_checkpoints,packet_files:[...packetNames,'SHA256SUMS'],manifest_sha256:sha(await readFile(join(PACKET,'manifest.json'))),review_sha256:sha(await readFile(join(PACKET,'review.json'))),sums_sha256:sha(await readFile(join(PACKET,'SHA256SUMS'))),canonical_mutation:false});
console.log(`PASS — UC-174 exact three-role render packet created at ${PACKET}`);for(const{spec,source}of roleRows)console.log(`${spec.key} ${source.sha256} ${source.width}x${source.height}`);console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);console.log(`voice ${voiceRecordReceipt.sha256}`);console.log(`manifest ${sha(await readFile(join(PACKET,'manifest.json')))}`);console.log(`sums ${sha(await readFile(join(PACKET,'SHA256SUMS')))}`);
