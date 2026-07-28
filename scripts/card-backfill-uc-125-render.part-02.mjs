const review = {
  version: 1,
  record_id: 'UC-125',
  actor: 'Billy West',
  character: 'Ren, Stimpy & Fry',
  production: 'Ren & Stimpy / Futurama',
  year: 1991,
  side: 'still',
  expected_subject: 'Ren, Stimpy & Fry',
  source_sha256s: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source.sha256])),
  exact_role_record_sha256: roleRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subjects',
  presentation_ruling: 'three-role-character-composite',
  crop_ruling: 'pass-three-panel-face-and-body-layout',
  chronology_ruling: 'pass-1991-ren-stimpy-era-separated-from-ren-takeover-and-fry-debut',
  floor_exception_ruling: 'pass-three-explicit-official-source-width-exceptions',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-125 reviewed Billy West three-role still candidate\n\n- **Record:** UC-125\n- **Performer:** Billy West\n- **Displayed roles:** Ren Höek, Stimpy, and Philip J. Fry\n- **Productions:** Ren & Stimpy / Futurama\n- **Ren source:** \`${review.source_sha256s.ren}\`\n- **Stimpy source:** \`${review.source_sha256s.stimpy}\`\n- **Fry source:** \`${review.source_sha256s.fry}\`\n- **Exact role record:** \`${roleRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** all three expected subjects\n- **Presentation ruling:** three-role character composite\n- **Crop ruling:** pass, three face-and-body panels\n- **Chronology ruling:** 1991 Ren & Stimpy era separated from the 1993 Ren takeover and 1999 Fry debut\n- **Source-width ruling:** pass, three explicit 240-pixel official-source exceptions\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe three exact official character assets, four official source-page receipts, deterministic composite, wall simulation, duplicate receipt, and exact-role record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-125',
  actor: 'Billy West',
  character: 'Ren, Stimpy & Fry',
  production: 'Ren & Stimpy / Futurama',
  year: 1991,
  side: 'still',
  expected_subject: 'Ren, Stimpy & Fry',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: manifestReceipt.sha256,
    discovery_summary_sha256: summaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactReceipt.sha256,
    role_contact_sheet_sha256s: { ren: renContactReceipt.sha256, stimpy: stimpyContactReceipt.sha256, fry: fryContactReceipt.sha256 },
    render_artifact: null,
    apply_control_sha256: null
  },
  actor_role_custody: Object.fromEntries(actorRoleRows.map(({ control: row, screenshot }) => [row.key, {
    provider: row.provider,
    source_page: row.page_url,
    binding: row.binding,
    body_sha256: row.body_sha256,
    page_screenshot: screenshot
  }])),
  chronology_boundary: exactRoleRecord.composite_boundary,
  roles: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    source_page_key: role.source_page_key,
    selected_asset_title: role.asset_title,
    selected_source_url: role.declared_url,
    original: source,
    role_history: role.role_history,
    generic_width_floor_exception: role.generic_width_floor_exception,
    floor_exception_ruling: role.floor_exception_ruling,
    selection_ruling: role.selection_ruling
  }])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate: {
    ...candidate,
    recipe: `Three ${control.render.panel_width}x${control.render.panel_height} face-and-body panels, ${control.render.divider_width}px dividers, ${control.render.internal_rule_height}px internal rules, ${control.render.filter} scaling, JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside edge while preserving all three role identities, complete figures, chronology boundaries, and official-source width rulings.'
  },
  rejected_orbit_summary: [
    'Other Nickelodeon characters, other Futurama characters, later substitute performers, actor portraits, toys, games, posters, cosplay, merchandise, generic ensembles, and fan art were rejected.',
    'No looser franchise image replaced the three exact role-labeled Billy West official assets merely to exceed the generic 250-pixel width floor.',
    'The three official assets remain chronology-bound to Stimpy from 1991, Ren from 1993, and Fry from 1999.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: {
    identity: review.identity_ruling,
    presentation: review.presentation_ruling,
    crop_ruling: review.crop_ruling,
    chronology_ruling: review.chronology_ruling,
    floor_exception_ruling: review.floor_exception_ruling,
    notes
  },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetNames = [
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'exact-role-record.json',
  'fry-original.jpg',
  'manifest.json',
  'ren-original.jpg',
  'review.json',
  'review.md',
  'source-page-billy-west-current-official.png',
  'source-page-billy-west-role-history.png',
  'source-page-hulu-futurama.png',
  'source-page-paramount-ren-stimpy.png',
  'stimpy-original.jpg',
  'uc-125-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-125',
  sources: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate,
  crop_preview: cropPreview,
  actor_role_pages: Object.fromEntries(actorRoleRows.map(({ control: row, screenshot }) => [row.key, screenshot])),
  repository_hash_count: repository.size,
  official_source_width_exceptions: 3,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-125 exact three-role render packet created at ${PACKET}`);
for (const { role, source } of roleRows) console.log(`${role.key} ${source.sha256} ${source.width}x${source.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`role ${roleRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
