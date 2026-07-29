const duplicateItems = [
  ...roleRows.map(({ role, source }) => ({ label: `${role.display_label} selected official character source`, path: source.path, sha256: source.sha256, matches: repository.get(source.sha256) || [] })),
  { label: 'UC-156 two-role voice candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-156 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-156 exact-byte duplicate detected');
await writeJson(join(PACKET, 'duplicate-scan.json'), {
  version: 1,
  repository_hash_count: repository.size,
  items: duplicateItems,
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  status: 'pass',
  semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
});

const notes = [
  'DoctorWho.tv credits Nicholas Briggs as the Dalek voice in Dalek, broadcast 30 April 2005, establishing the revived television voice chronology at its first Dalek story.',
  'Army of Ghosts separately credits Paul Kasey as Cyber Leader and Nicholas Briggs with the Dalek/Cybermen voices. The packet therefore records Briggs’s voice performance without implying that he occupied the visible Cyberman suit or a Dalek casing.',
  'The selected Dalek and Cyberman images are official DoctorWho.tv character assets. Each image is byte-distinct, absent from 2,070 canonical media hashes, and tied to its official character page.',
  'The first discovery artifact retained valid source bytes but was rejected because three page screenshots collapsed to the same generic viewport. The repaired discovery produced four distinct, term-focused page receipts without changing either selected character source.',
  'The 2005– canonical range denotes Briggs’s revived-era television voice tenure. It does not assign him classic-series voices and does not use an audio-only performance as a substitute for television evidence.',
  'Each 624x1000 panel uses centered contain scaling on a dark field. This preserves every edge present in the 446x666 official portraits instead of cropping appendages or fabricating a fuller body.',
  'The Dalek panel preserves the dome, eyestalk, lamps, grille, plunger, gunstick, casing, and lower hemispheres. The Cyberman panel preserves the handles, headlamp, faceplate, eyes, mouth, neck, shoulder armour, chest unit, and upper-body silhouette.',
  'The 1246x1000 wall simulation removes seven pixels from each outside dark field without changing either character, the voice-performance attribution, the operator separation, or the source-edge ruling.',
  'The existing Nicholas Briggs performer portrait remains unchanged and outside the character-still packet.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review = {
  version: 1,
  record_id: 'UC-156',
  kind: 'voice',
  actor: 'Nicholas Briggs',
  character: 'The voice of the Daleks & Cybermen',
  production: 'Doctor Who (2005– )',
  years: '2005–',
  side: 'still',
  expected_subject: 'The voice of the Daleks & Cybermen',
  source_sha256s: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source.sha256])),
  exact_voice_record_sha256: voiceRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subjects',
  presentation_ruling: 'two-role-dalek-cyberman-voice-composite',
  crop_ruling: 'pass-two-panel-centered-contain-layout',
  chronology_ruling: 'pass-2005-dalek-start-and-2006-cyberman-credit',
  operator_separation_ruling: 'pass-voice-credit-separated-from-visible-operators-and-suit-performers',
  screenshot_repair_ruling: 'pass-four-distinct-term-focused-page-receipts',
  portrait_separation_ruling: 'pass-existing-performer-portrait-unchanged',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-156 reviewed Nicholas Briggs Dalek and Cyberman still candidate\n\n- **Record:** UC-156\n- **Performer:** Nicholas Briggs\n- **Displayed roles:** Dalek and Cyberman\n- **Production scope:** Doctor Who television, revived era\n- **Dalek source:** \`${review.source_sha256s.dalek}\`\n- **Cyberman source:** \`${review.source_sha256s.cyberman}\`\n- **Exact voice record:** \`${voiceRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** both expected subjects\n- **Presentation ruling:** two-role Dalek/Cyberman voice composite\n- **Crop ruling:** pass, two centered contain panels\n- **Chronology ruling:** 2005 Dalek start separated from 2006 Cyberman credit\n- **Operator separation:** voice credit remains separate from visible operators and suit performers\n- **Page-receipt ruling:** four distinct term-focused screenshots\n- **Portrait separation:** existing Nicholas Briggs portrait remains unchanged\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe two official character assets, four focused page receipts, rejected generic-viewport checkpoint, deterministic diptych, wall simulation, duplicate receipt, and exact-voice record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-156',
  kind: 'voice',
  actor: 'Nicholas Briggs',
  character: 'The voice of the Daleks & Cybermen',
  production: 'Doctor Who (2005– )',
  years: '2005–',
  side: 'still',
  expected_subject: 'The voice of the Daleks & Cybermen',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    failed_discovery_checkpoints: control.failed_discovery_checkpoints,
    discovery_repair_boundary: control.discovery_repair_boundary,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: manifestReceipt.sha256,
    discovery_summary_sha256: summaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactReceipt.sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  source_custody: Object.fromEntries(pageRows.map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider,
    source_page: row.page_url,
    binding: row.binding,
    page_title: evidence.title,
    required_terms: row.required_terms,
    body_sha256: evidence.body_sha256,
    page_screenshot: screenshot
  }])),
  chronology_boundary: exactVoiceRecord.composite_boundary,
  actor_role_bindings: exactVoiceRecord.actor_role_bindings,
  roles: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    source_page_key: role.source_page_key,
    actor_role_page_key: role.actor_role_page_key,
    selected_asset_title: role.asset_title,
    selected_source_url: role.declared_url,
    original: source,
    chronology: role.chronology,
    selection_ruling: role.selection_ruling
  }])),
  exact_voice_record: { path: 'exact-voice-record.json', ...voiceRecordReceipt },
  candidate: {
    ...candidate,
    recipe: `Two ${control.render.panel_width}x${control.render.panel_height} centered contain panels on ${control.render.panel_background}, ${control.render.divider_width}px ${control.render.divider_color} divider, ${control.render.filter} scaling, JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside dark field while preserving all source edges, both character identities, the voice chronology, and operator separation.'
  },
  rejected_orbit_summary: [
    'Classic-series voices, audio-only substitutions, Dalek operators, Cyberman suit performers, toys, cosplay, games, posters, and generic monster montages were rejected.',
    'Dalek-only and Cyberman-only layouts were rejected because the card requires both named voice roles.',
    'The first discovery artifact was retained as a failed page-receipt checkpoint because three screenshots were byte-identical generic viewports; its accepted character bytes remained unchanged in the repaired discovery.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: {
    identity: review.identity_ruling,
    presentation: review.presentation_ruling,
    crop_ruling: review.crop_ruling,
    chronology_ruling: review.chronology_ruling,
    operator_separation_ruling: review.operator_separation_ruling,
    screenshot_repair_ruling: review.screenshot_repair_ruling,
    portrait_separation_ruling: review.portrait_separation_ruling,
    notes
  },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetNames = [
  'card-crop-preview.jpg',
  'cyberman-original.jpg',
  'dalek-original.jpg',
  'duplicate-scan.json',
  'exact-voice-record.json',
  'manifest.json',
  'review.json',
  'review.md',
  'source-page-doctorwho-army-of-ghosts-2006.png',
  'source-page-doctorwho-cybermen-character.png',
  'source-page-doctorwho-dalek-2005.png',
  'source-page-doctorwho-daleks-character.png',
  'uc-156-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-156',
  sources: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source])),
  exact_voice_record: { path: 'exact-voice-record.json', ...voiceRecordReceipt },
  candidate,
  crop_preview: cropPreview,
  source_pages: Object.fromEntries(pageRows.map(({ control: row, screenshot }) => [row.key, screenshot])),
  repository_hash_count: repository.size,
  failed_discovery_checkpoints: control.failed_discovery_checkpoints,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-156 exact two-role voice render packet created at ${PACKET}`);
for (const { role, source } of roleRows) console.log(`${role.key} ${source.sha256} ${source.width}x${source.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`voice ${voiceRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
