const duplicateItems=[
  ...roleRows.map(({spec,source})=>({label:`${spec.display_label} selected source`,path:source.path,sha256:source.sha256,matches:repository.get(source.sha256)||[]})),
  {label:'UC-171 three-role candidate',path:candidate.path,sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]},
  {label:'UC-171 wall crop preview',path:cropPreview.path,sha256:cropPreview.sha256,matches:repository.get(cropPreview.sha256)||[]}
];
assert(duplicateItems.every(item=>item.matches.length===0),'UC-171 exact-byte duplicate detected');
await writeJson(join(PACKET,'duplicate-scan.json'),{version:1,repository_hash_count:repository.size,items:duplicateItems,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,status:'pass',semantics:'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'});

const notes=[
  'Hulu identifies Rob Paulsen as both Yakko Warner and Pinky in Animaniacs. The Television Academy separately identifies his Raphael from the original Teenage Mutant Ninja Turtles and distinguishes that role from his later Donatello.',
  'The live Paramount+ page independently fixes the turtle production to the 1987 animated television series and exposes dated episode chronology. The blocked Paramount investor release remains reference-only and its transport failure remains visible.',
  'Yakko and Pinky are bound to their 1993 Animaniacs origins. Raphael is bound to the 1987 animated series. The canonical 1980s– field is a broad Paulsen career envelope and is not projected onto Yakko or Pinky.',
  'The selected Yakko page image preserves the complete ears, face, red nose, black body, white gloves, belt, trousers, and feet. The selected Pinky page image preserves the complete ears, face, blue eyes, red nose, white body, hands, feet, and tail.',
  'The selected Raphael page image preserves the 1987 red mask, face, shell, chest, belt emblem, arms, legs, wraps, and sai. It does not depict Paulsen’s later Donatello or another turtle continuity.',
  'Each panel contains a 560-pixel face region and a 432-pixel full-character region separated by an eight-pixel rule. Twelve-pixel dividers prevent role bleed-through.',
  'The 1246x1000 wall simulation removes seven pixels from each outside dark field without changing any face, body, role, chronology, or source-edge ruling.',
  'The existing Rob Paulsen performer portrait remains unchanged and outside the still packet’s asserted object.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review={
  version:1,record_id:'UC-171',kind:'voice',actor:'Rob Paulsen',character:'Yakko Warner, Pinky, Raphael',production:'Animaniacs / TMNT',years:'1980s–',side:'still',expected_subject:'Yakko Warner, Pinky, Raphael',
  source_sha256:Object.fromEntries(roleRows.map(({spec,source})=>[spec.key,source.sha256])),exact_voice_record_sha256:voiceRecordReceipt.sha256,candidate_sha256:candidate.sha256,crop_preview_sha256:cropPreview.sha256,
  identity_ruling:'exact-three-role-subject-set',presentation_ruling:'three-role-animated-character-composite',crop_ruling:'pass-face-and-full-character-triptych',chronology_ruling:'pass-role-specific-1987-and-1993-boundaries',raphael_ruling:'pass-original-1987-raphael-distinct-from-later-donatello',reference_only_ruling:'pass-blocked-paramount-release-retained-as-reference-only',portrait_separation_ruling:'pass-existing-performer-portrait-unchanged',
  reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:'reviewed-evidence-candidate',notes
};
await writeJson(join(PACKET,'review.json'),review);
const reviewMd=`# UC-171 reviewed Rob Paulsen three-role still candidate\n\n- **Record:** UC-171\n- **Performer:** Rob Paulsen\n- **Displayed roles:** Yakko Warner, Pinky, Raphael\n- **Production envelope:** Animaniacs / TMNT\n- **Exact voice record:** \`${voiceRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** exact three-role subject set\n- **Presentation ruling:** three-role animated-character composite\n- **Crop ruling:** pass, face and full-character triptych\n- **Chronology ruling:** role-specific 1987 and 1993 boundaries pass\n- **Raphael ruling:** original 1987 Raphael remains distinct from later Donatello\n- **Reference-only ruling:** blocked Paramount release retained without satisfying runtime transport\n- **Portrait separation:** existing Rob Paulsen portrait remains unchanged\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note=>`- ${note}`).join('\n')}\n\nThe selected role bytes, raw revisions, MediaWiki API receipts, three strict runtime page receipts, one reference-only Paramount record, deterministic triptych, wall simulation, duplicate receipt, and exact voice record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET,'review.md'),reviewMd);

const manifest={
  version:1,lane:'card-backfill',record_id:'UC-171',kind:'voice',actor:'Rob Paulsen',character:'Yakko Warner, Pinky, Raphael',production:'Animaniacs / TMNT',years:'1980s–',side:'still',expected_subject:'Yakko Warner, Pinky, Raphael',
  reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,
  custody:{discovery_artifact:control.discovery_artifact,failed_discovery_checkpoints:control.failed_discovery_checkpoints,discovery_repair_boundary:control.discovery_repair_boundary,render_control_sha256:sha(await readFile(CONTROL)),discovery_manifest_sha256:discoveryManifestReceipt.sha256,discovery_summary_sha256:discoverySummaryReceipt.sha256,discovery_contact_sheet_sha256:discoveryContactReceipt.sha256,render_artifact:null,apply_control_sha256:null},
  actor_role_custody:Object.fromEntries(identityRows.map(({spec,evidence,screenshot})=>[spec.key,{provider:spec.provider,source_page:spec.page_url,binding:spec.binding,strict:spec.reference_only!==true,reference_only:spec.reference_only===true,externally_verified:spec.externally_verified===true,...(screenshot?{page_title:evidence.title,body_sha256:evidence.body_sha256,page_screenshot:screenshot}:{runtime_transport:'reference-only-external-verification'})}])),
  chronology_boundary:exactVoiceRecord.chronology_boundary,
  composite_boundary:exactVoiceRecord.composite_boundary,
  roles:Object.fromEntries(roleRows.map(({spec,source,raw,primaryApi,imageApi})=>[spec.key,{role:spec.role,display_label:spec.display_label,provider:spec.provider,source_page:spec.source_page,file_title:spec.file_title,original_url:spec.original_url,original:source,raw_revision:raw,primary_api_receipt:primaryApi,image_api_receipt:imageApi,pageimage_source:true,chronology:spec.chronology,selection_ruling:spec.selection_ruling}])),
  exact_voice_record:{path:'exact-voice-record.json',...voiceRecordReceipt},
  candidate:{...candidate,recipe:`Three ${control.render.panel_width}x${control.render.panel_height} panels; ${control.render.face_height}px face cover; ${control.render.internal_rule_height}px rule; ${control.render.body_height}px centered full-character view; ${control.render.divider_width}px dividers; ${control.render.filter}; JPEG quality ${control.render.jpeg_quality}`},
  crop_preview:{...cropPreview,gravity:control.render.wall_gravity,semantics:'The wall simulation removes seven pixels from each outside dark field while preserving all three faces, full-character regions, role boundaries, and chronology rulings.'},
  rejected_orbit_summary:[
    'The blocked Paramount investor release remains reference-only after hosted-runner transport failure.',
    'The first Paramount+ assumption was rejected because the live page defaulted to Season 3 rather than exposing the assumed first-episode strings.',
    'The invented spaced Yakko template label was rejected in favor of the exact raw-revision `voiced by` phrase.',
    'Wakko, Dot, Brain, other mice, later Donatello, other turtles, live-action suits, other Raphael performers, toys, games, posters, and incomplete composites remain outside the evidence boundary.'
  ],
  duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},
  exact_subject_review:{identity:review.identity_ruling,presentation:review.presentation_ruling,crop_ruling:review.crop_ruling,chronology_ruling:review.chronology_ruling,raphael_ruling:review.raphael_ruling,reference_only_ruling:review.reference_only_ruling,portrait_separation_ruling:review.portrait_separation_ruling,notes},
  disposition:'reviewed-evidence-candidate',canonical_mutation:false
};
await writeJson(join(PACKET,'manifest.json'),manifest);

const packetNames=[
  'card-crop-preview.jpg','duplicate-scan.json','exact-voice-record.json','manifest.json','review.json','review.md',
  'yakko-original.webp','pinky-original.webp','raphael-1987-original.webp',
  'source-raw-yakko.wikitext','source-raw-pinky.wikitext','source-raw-raphael-1987.wikitext',
  'source-api-yakko-primary.json','source-api-pinky-primary.json','source-api-raphael-1987-primary.json',
  'source-api-yakko-image.json','source-api-pinky-image.json','source-api-raphael-1987-image.json',
  'source-page-hulu-animaniacs.png','source-page-television-academy-sounds-familiar.png','source-page-paramount-plus-tmnt-1987.png',
  'uc-171-still-candidate.jpg'
];
const sums=[];for(const name of packetNames)sums.push(`${sha(await readFile(join(PACKET,name)))}  ${name}`);await writeFile(join(PACKET,'SHA256SUMS'),sums.join('\n')+'\n');
await writeJson(join(OUT,'render-summary.json'),{record_id:'UC-171',sources:Object.fromEntries(roleRows.map(({spec,source})=>[spec.key,source])),exact_voice_record:{path:'exact-voice-record.json',...voiceRecordReceipt},candidate,crop_preview:cropPreview,strict_identity_pages:Object.fromEntries(identityRows.filter(row=>row.screenshot).map(({spec,screenshot})=>[spec.key,screenshot])),repository_hash_count:repository.size,failed_discovery_checkpoints:control.failed_discovery_checkpoints,packet_files:[...packetNames,'SHA256SUMS'],manifest_sha256:sha(await readFile(join(PACKET,'manifest.json'))),review_sha256:sha(await readFile(join(PACKET,'review.json'))),sums_sha256:sha(await readFile(join(PACKET,'SHA256SUMS'))),canonical_mutation:false});
console.log(`PASS — UC-171 exact three-role render packet created at ${PACKET}`);for(const{spec,source}of roleRows)console.log(`${spec.key} ${source.sha256} ${source.width}x${source.height}`);console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);console.log(`voice ${voiceRecordReceipt.sha256}`);console.log(`manifest ${sha(await readFile(join(PACKET,'manifest.json')))}`);console.log(`sums ${sha(await readFile(join(PACKET,'SHA256SUMS')))}`);
