function renderRegion(input, output, { crop = null, resize, background, extent }) {
  const args = [input, '-auto-orient'];
  if (crop) args.push('-crop', crop, '+repage');
  args.push('-filter', control.render.filter, '-resize', resize, '-background', background, '-gravity', 'center', '-extent', extent, '-alpha', 'remove', '-alpha', 'off', output);
  magick(...args);
}

const roleByKey = Object.fromEntries(selectedRows.map(row => [row.control.key, row]));
const rulePath = join(TMP, 'rule.png');
const dividerPath = join(TMP, 'divider.png');
magick('-size', `${control.render.panel_width}x${control.render.internal_rule_height}`, `xc:${control.render.rule_background}`, rulePath);
magick('-size', `${control.render.divider_width}x${control.render.panel_height}`, `xc:${control.render.rule_background}`, dividerPath);

const panelPaths = [];
for (const key of ['brain','kif','egon']) {
  const selected = roleByKey[key];
  const input = join(PACKET, selected.source.path);
  const top = join(TMP, `${key}-top.png`);
  const bottom = join(TMP, `${key}-bottom.png`);
  const panel = join(TMP, `${key}-panel.png`);
  if (key === 'brain') {
    renderRegion(input, top, { crop: control.render.brain_top_crop, resize: control.render.brain_top_resize, background: control.render.dark_background, extent: `${control.render.panel_width}x${control.render.top_height}` });
    renderRegion(input, bottom, { resize: control.render.brain_bottom_resize, background: control.render.dark_background, extent: `${control.render.panel_width}x${control.render.bottom_height}` });
  } else if (key === 'kif') {
    renderRegion(input, top, { crop: control.render.kif_top_crop, resize: control.render.kif_top_resize, background: control.render.dark_background, extent: `${control.render.panel_width}x${control.render.top_height}` });
    renderRegion(input, bottom, { resize: control.render.kif_bottom_resize, background: control.render.dark_background, extent: `${control.render.panel_width}x${control.render.bottom_height}` });
  } else {
    renderRegion(input, top, { crop: control.render.egon_top_crop, resize: control.render.egon_top_resize, background: control.render.light_background, extent: `${control.render.panel_width}x${control.render.top_height}` });
    renderRegion(input, bottom, { crop: control.render.egon_bottom_crop, resize: control.render.egon_bottom_resize, background: control.render.light_background, extent: `${control.render.panel_width}x${control.render.bottom_height}` });
  }
  magick(top, rulePath, bottom, '-append', panel);
  assert(identify(panel, 'image/png').width === 412 && identify(panel, 'image/png').height === 1000, `${key} panel geometry drift`);
  panelPaths.push(panel);
}

const candidatePath = join(PACKET, 'uc-170-still-candidate.jpg');
magick(panelPaths[0], dividerPath, panelPaths[1], dividerPath, panelPaths[2], '+append', '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-170-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };

const duplicateItems = [
  ...selectedRows.map(({ control: row, source }) => ({ label: `${row.display_label} selected source`, path: source.path, sha256: source.sha256, matches: repository.get(source.sha256) || [] })),
  { label: 'UC-170 three-role candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-170 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-170 exact-byte duplicate detected');
await writeJson(join(PACKET, 'duplicate-scan.json'), {
  version: 1, repository_hash_count: repository.size, items: duplicateItems,
  reviewed_at: control.reviewed_at, reviewed_by: control.reviewed_by, status: 'pass',
  semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
});

const notes = [
  'The Television Academy, Hulu press records, and Sony’s official Ghostbusters archive establish Maurice LaMarche’s association with Kif, animated Egon, Animaniacs, Pinky and the Brain, Futurama, and The Real Ghostbusters.',
  'The Brain panel uses the character page’s exact page-image art. The face crop preserves both ears, eyes, nose, muzzle, and expression; the lower region preserves the complete body and tail.',
  'Kif uses the exact 144x444 page-image object. Its one source-floor exception remains bound to the normalized MediaWiki title, page-image identity, WebP MIME, 12,104 bytes, exact SHA-256, and geometry. The lower region preserves the complete body and uniform.',
  'Animated Egon uses the production-colour model sheet rather than live-action Egon or Harold Ramis imagery. The face region preserves hair, glasses, facial design, uniform, and proton pack; the lower region preserves the complete animated body, equipment, boots, and silhouette.',
  'The canonical 1980s– field is a broad Maurice LaMarche career envelope. Animated Egon is bound to 1986–1991, The Brain to an Animaniacs origin in 1993, and Kif to Futurama beginning in 1999.',
  'All three failed discovery checkpoints remain visible. The successful orbit repaired only receipt binding, the exact Kif floor exception, and MediaWiki underscore-versus-space page-image normalization.',
  'The 1260x1000 candidate uses three 412x1000 face-plus-body panels, two 12-pixel dividers, and an eight-pixel internal rule in each panel.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing any face, body, role identity, chronology, source-floor ruling, or three-role completeness.',
  'The existing Maurice LaMarche performer portrait remains unchanged and outside the still packet’s asserted object.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review = {
  version: 1, record_id: 'UC-170', kind: 'voice', actor: 'Maurice LaMarche', character: 'The Brain, Kif Kroker, Egon Spengler', production: 'Animaniacs / Futurama', years: '1980s–', side: 'still',
  source_sha256: Object.fromEntries(selectedRows.map(({ control: row, source }) => [row.key, source.sha256])),
  exact_voice_record_sha256: voiceRecordReceipt.sha256,
  candidate_sha256: candidate.sha256, crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-three-role-subject',
  presentation_ruling: 'three-role-animated-character-composite',
  crop_ruling: 'pass-three-face-and-body-panels',
  chronology_ruling: 'pass-role-specific-1986-1993-1999-boundaries',
  Kif_source_floor_ruling: 'pass-exact-hash-and-geometry-bound-exception',
  live_action_egon_exclusion_ruling: 'pass-animated-egon-only',
  portrait_separation_ruling: 'pass-existing-performer-portrait-unchanged',
  reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role, reviewed_at: control.reviewed_at,
  canonical_mutation: false, disposition: 'reviewed-evidence-candidate', notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-170 reviewed Maurice LaMarche three-role still candidate\n\n- **Record:** UC-170\n- **Performer:** Maurice LaMarche\n- **Displayed roles:** The Brain, Kif Kroker, animated Egon Spengler\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Exact voice record:** \`${voiceRecordReceipt.sha256}\`\n- **Identity ruling:** expected three-role subject\n- **Presentation ruling:** three-role animated-character composite\n- **Crop ruling:** pass, three face-and-body panels\n- **Chronology:** Egon 1986–1991; Brain 1993; Kif 1999\n- **Kif floor exception:** pass, exact title/pageimage/hash/MIME/byte/geometry binding\n- **Live-action Egon exclusion:** pass\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1, lane: 'card-backfill', record_id: 'UC-170', kind: 'voice', actor: 'Maurice LaMarche', character: 'The Brain, Kif Kroker, Egon Spengler', production: 'Animaniacs / Futurama', years: '1980s–', side: 'still', expected_subject: 'The Brain, Kif Kroker, Egon Spengler',
  reviewed_at: control.reviewed_at, reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    failed_discovery_checkpoints: control.failed_discovery_checkpoints,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: discoveryManifestReceipt.sha256,
    discovery_summary_sha256: discoverySummaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactSheet.sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  actor_role_custody: Object.fromEntries(pageRows.map(({ control: row, evidence, screenshot }) => [row.key, { provider: row.provider, source_page: row.source_page, binding: row.binding, page_title: evidence.title, body_sha256: evidence.body_sha256, page_screenshot: screenshot }])),
  chronology_boundary: exactVoiceRecord.chronology_boundary,
  voice_boundary: exactVoiceRecord.voice_boundary,
  selected_roles: Object.fromEntries(selectedRows.map(({ control: row, source, raw, primaryApi, imageApi, candidate: sourceCandidate }) => [row.key, { role: row.role, provider: row.provider, source_page: row.source_page, file_title: row.file_title, original_url: row.original_url, original: source, raw_revision: raw, primary_api: primaryApi, image_api: imageApi, pageimage_source: sourceCandidate.pageimage_source, generic_width_floor_exception: sourceCandidate.generic_width_floor_exception === true, chronology: row.chronology, selection_ruling: row.selection_ruling }])),
  exact_voice_record: { path: 'exact-voice-record.json', ...voiceRecordReceipt },
  source_contact_sheet: contactSheet,
  candidate: { ...candidate, recipe: 'Three 412x1000 face-plus-body panels; 12px dividers; 560px face region; 8px rule; 432px full-body region; Lanczos; JPEG quality 94.' },
  crop_preview: { ...cropPreview, gravity: control.render.wall_gravity, semantics: 'Seven pixels removed from each outside edge; all three role faces, bodies, silhouettes, and custody rulings remain legible.' },
  rejected_orbit_summary: [
    'The first discovery failed on an undefined candidate receipt property.',
    'The second discovery failed because Kif’s exact 144x444 page image was below the general 180-pixel width floor.',
    'The third discovery failed because MediaWiki underscore and space variants were compared as different page-image titles.',
    'Live-action Egon, Harold Ramis imagery, Pinky, other Futurama aliens, toys, games, posters, and incomplete one- or two-role layouts remain outside the evidence boundary.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: { identity: review.identity_ruling, presentation: review.presentation_ruling, crop_ruling: review.crop_ruling, chronology_ruling: review.chronology_ruling, Kif_source_floor_ruling: review.Kif_source_floor_ruling, live_action_egon_exclusion_ruling: review.live_action_egon_exclusion_ruling, portrait_separation_ruling: review.portrait_separation_ruling, notes },
  disposition: 'reviewed-evidence-candidate', canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetNames = [
  'brain-original.webp','kif-original.webp','egon-original.webp',
  'source-raw-brain.wikitext','source-raw-kif.wikitext','source-raw-egon.wikitext',
  'source-api-brain-primary.json','source-api-kif-primary.json','source-api-egon-primary.json',
  'source-api-brain-image.json','source-api-kif-image.json','source-api-egon-image.json',
  'source-page-television-academy-maurice-lamarche.png','source-page-hulu-animaniacs.png','source-page-hulu-futurama.png','source-page-ghostbusters-real-ghostbusters.png',
  'source-contact-sheet-all-roles.jpg','exact-voice-record.json','duplicate-scan.json','review.json','review.md','manifest.json','uc-170-still-candidate.jpg','card-crop-preview.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-170',
  sources: Object.fromEntries(selectedRows.map(({ control: row, source }) => [row.key, source])),
  exact_voice_record: { path: 'exact-voice-record.json', ...voiceRecordReceipt },
  candidate, crop_preview: cropPreview, source_contact_sheet: contactSheet,
  repository_hash_count: repository.size, failed_discovery_checkpoints: control.failed_discovery_checkpoints,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
await rm(TMP, { recursive: true, force: true });
console.log(`PASS — UC-170 three-role render packet created at ${PACKET}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height} ${candidate.bytes}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height} ${cropPreview.bytes}`);
console.log(`voice ${voiceRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
