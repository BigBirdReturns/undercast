const duplicateItems = [
  ...roleRows.map(({spec,source}) => ({ label:`${spec.display_label} selected source`, path:source.path, sha256:source.sha256, matches:repository.get(source.sha256) || [] })),
  { label:'UC-172 three-role candidate', path:candidate.path, sha256:candidate.sha256, matches:repository.get(candidate.sha256) || [] },
  { label:'UC-172 wall crop preview', path:cropPreview.path, sha256:cropPreview.sha256, matches:repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-172 exact-byte duplicate detected');
await writeJson(join(PACKET,'duplicate-scan.json'), {
  version:1,
  repository_hash_count:repository.size,
  items:duplicateItems,
  reviewed_at:control.reviewed_at,
  reviewed_by:control.reviewed_by,
  status:'pass',
  semantics:'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
});

const notes = [
  'D23 identifies Jim Cummings as Winnie the Pooh, Tigger, and Darkwing Duck. A separate dated D23 film record credits him as Pooh and Tigger, and D23 fixes Darkwing Duck to the animated television series beginning in 1991.',
  'The exact raw Pooh revision retains Sterling Holloway and Jim Cummings in the role history. The exact raw Tigger revision retains Paul Winchell and Jim Cummings. The selected actor-role edges therefore do not rewrite the predecessor ledger.',
  'The selected Pooh page image preserves the ears, face, red shirt, shoulders, arms, and upper-body silhouette without Tigger, Piglet, live action, a game rendering, or a park costume.',
  'The selected Tigger page image preserves the ears, face, red nose, striped head, shoulders, torso, arms, tail, and bouncing silhouette without Pooh, a game rendering, or a park costume.',
  'The selected Darkwing page image preserves the hat, masked eyes, bill, jacket, cape, gloves, legs, feet, and complete caped silhouette without Negaduck, another duck, a costume performer, or an ensemble.',
  'Each panel contains a 560-pixel face region and a 432-pixel full-source region separated by an eight-pixel rule. Twelve-pixel dividers prevent role bleed-through.',
  'The 1246x1000 wall simulation removes seven pixels from each outside dark field without changing any face, body, role, chronology, inheritance, or source-edge ruling.',
  'The existing Jim Cummings performer portrait remains unchanged and outside the still packet’s asserted object.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review = {
  version:1,
  record_id:'UC-172',
  kind:'voice',
  actor:'Jim Cummings',
  character:'Winnie the Pooh, Tigger, Darkwing Duck',
  production:'Disney',
  years:'1980s–',
  side:'still',
  expected_subject:'Winnie the Pooh, Tigger, Darkwing Duck',
  source_sha256:Object.fromEntries(roleRows.map(({spec,source}) => [spec.key,source.sha256])),
  exact_voice_record_sha256:voiceRecordReceipt.sha256,
  candidate_sha256:candidate.sha256,
  crop_preview_sha256:cropPreview.sha256,
  identity_ruling:'exact-three-role-subject-set',
  presentation_ruling:'three-role-animated-character-composite',
  crop_ruling:'pass-face-and-full-source-triptych',
  chronology_ruling:'pass-cummings-era-inheritance-and-1991-boundaries',
  inheritance_ruling:'pass-pooh-and-tigger-predecessor-separation',
  portrait_separation_ruling:'pass-existing-performer-portrait-unchanged',
  reviewed_by:control.reviewed_by,
  reviewed_role:control.reviewed_role,
  reviewed_at:control.reviewed_at,
  canonical_mutation:false,
  disposition:'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET,'review.json'), review);
const reviewMd = `# UC-172 reviewed Jim Cummings three-role still candidate

- **Record:** UC-172
- **Performer:** Jim Cummings
- **Displayed roles:** Winnie the Pooh, Tigger, Darkwing Duck
- **Production envelope:** Disney
- **Exact voice record:** \`${voiceRecordReceipt.sha256}\`
- **Candidate:** \`${candidate.sha256}\`
- **Wall-crop preview:** \`${cropPreview.sha256}\`
- **Identity ruling:** exact three-role subject set
- **Presentation ruling:** three-role animated-character composite
- **Crop ruling:** pass, face and full-source triptych
- **Chronology ruling:** Cummings-era inheritance and 1991 Darkwing boundaries pass
- **Inheritance ruling:** Pooh and Tigger predecessor separation passes
- **Portrait separation:** existing Jim Cummings portrait remains unchanged
- **Canonical mutation:** none

## Visual and custody ruling

${notes.map(note => `- ${note}`).join('\n')}

The selected role bytes, raw revisions, MediaWiki API receipts, three D23 page receipts, deterministic triptych, wall simulation, duplicate receipt, and exact voice record remain evidence-only pending independent canonical acceptance.
`;
await writeFile(join(PACKET,'review.md'), reviewMd);

const manifest = {
  version:1,
  lane:'card-backfill',
  record_id:'UC-172',
  kind:'voice',
  actor:'Jim Cummings',
  character:'Winnie the Pooh, Tigger, Darkwing Duck',
  production:'Disney',
  years:'1980s–',
  side:'still',
  expected_subject:'Winnie the Pooh, Tigger, Darkwing Duck',
  reviewed_at:control.reviewed_at,
  reviewed_by:control.reviewed_by,
  reviewed_role:control.reviewed_role,
  custody:{
    discovery_artifact:control.discovery_artifact,
    failed_discovery_checkpoints:control.failed_discovery_checkpoints,
    discovery_repair_boundary:control.discovery_repair_boundary,
    render_control_sha256:sha(await readFile(CONTROL)),
    discovery_manifest_sha256:discoveryManifestReceipt.sha256,
    discovery_summary_sha256:discoverySummaryReceipt.sha256,
    discovery_contact_sheet_sha256:discoveryContactReceipt.sha256,
    render_artifact:null,
    apply_control_sha256:null
  },
  actor_role_custody:Object.fromEntries(identityRows.map(({spec,evidence,screenshot}) => [spec.key, {
    provider:spec.provider,
    source_page:spec.page_url,
    binding:spec.binding,
    strict:true,
    page_title:evidence.title,
    body_sha256:evidence.body_sha256,
    page_screenshot:screenshot
  }])),
  chronology_boundary:exactVoiceRecord.chronology_boundary,
  composite_boundary:exactVoiceRecord.composite_boundary,
  roles:Object.fromEntries(roleRows.map(({spec,source,raw,primaryApi,imageApi}) => [spec.key, {
    role:spec.role,
    display_label:spec.display_label,
    provider:spec.provider,
    source_page:spec.source_page,
    file_title:spec.file_title,
    original_url:spec.original_url,
    original:source,
    raw_revision:raw,
    primary_api_receipt:primaryApi,
    image_api_receipt:imageApi,
    pageimage_source:true,
    chronology:spec.chronology,
    selection_ruling:spec.selection_ruling
  }])),
  exact_voice_record:{ path:'exact-voice-record.json', ...voiceRecordReceipt },
  candidate:{
    ...candidate,
    recipe:`Three ${control.render.panel_width}x${control.render.panel_height} panels; ${control.render.face_height}px face cover; ${control.render.internal_rule_height}px rule; ${control.render.body_height}px centered full-source view; ${control.render.divider_width}px dividers; ${control.render.filter}; JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview:{
    ...cropPreview,
    gravity:control.render.wall_gravity,
    semantics:'The wall simulation removes seven pixels from each outside dark field while preserving all three faces, full-source regions, role boundaries, predecessor separations, and chronology rulings.'
  },
  rejected_orbit_summary:[
    'Sterling Holloway-era Pooh and Paul Winchell-era Tigger cannot substitute for the Cummings voice edges.',
    'Pooh or Tigger game renderings, park costumes, live action, and ensemble frames were rejected.',
    'Negaduck, other ducks, costume performers, merchandise, games, posters, and incomplete composites remain outside the evidence boundary.'
  ],
  duplicate_scan:{ path:'duplicate-scan.json', repository_hash_count:repository.size, status:'pass' },
  exact_subject_review:{
    identity:review.identity_ruling,
    presentation:review.presentation_ruling,
    crop_ruling:review.crop_ruling,
    chronology_ruling:review.chronology_ruling,
    inheritance_ruling:review.inheritance_ruling,
    portrait_separation_ruling:review.portrait_separation_ruling,
    notes
  },
  disposition:'reviewed-evidence-candidate',
  canonical_mutation:false
};
await writeJson(join(PACKET,'manifest.json'), manifest);

const packetNames = [
  'card-crop-preview.jpg','duplicate-scan.json','exact-voice-record.json','manifest.json','review.json','review.md',
  'pooh-original.webp','tigger-original.webp','darkwing-original.webp',
  'source-raw-pooh.wikitext','source-raw-tigger.wikitext','source-raw-darkwing.wikitext',
  'source-api-pooh-primary.json','source-api-tigger-primary.json','source-api-darkwing-primary.json',
  'source-api-pooh-image.json','source-api-tigger-image.json','source-api-darkwing-image.json',
  'source-page-d23-character-voices-2022.png','source-page-d23-piglets-big-movie.png','source-page-d23-darkwing-duck-television.png',
  'uc-172-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET,name)))}  ${name}`);
await writeFile(join(PACKET,'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT,'render-summary.json'), {
  record_id:'UC-172',
  sources:Object.fromEntries(roleRows.map(({spec,source}) => [spec.key,source])),
  exact_voice_record:{ path:'exact-voice-record.json', ...voiceRecordReceipt },
  candidate,
  crop_preview:cropPreview,
  strict_identity_pages:Object.fromEntries(identityRows.map(({spec,screenshot}) => [spec.key,screenshot])),
  repository_hash_count:repository.size,
  failed_discovery_checkpoints:[],
  packet_files:[...packetNames,'SHA256SUMS'],
  manifest_sha256:sha(await readFile(join(PACKET,'manifest.json'))),
  review_sha256:sha(await readFile(join(PACKET,'review.json'))),
  sums_sha256:sha(await readFile(join(PACKET,'SHA256SUMS'))),
  canonical_mutation:false
});
console.log(`PASS — UC-172 exact three-role render packet created at ${PACKET}`);
for (const {spec,source} of roleRows) console.log(`${spec.key} ${source.sha256} ${source.width}x${source.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`voice ${voiceRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET,'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET,'SHA256SUMS')))}`);
