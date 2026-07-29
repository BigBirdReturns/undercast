const review = {
  version: 1, record_id: 'UC-126', actor: 'Tara Strong', character: 'Bubbles, Timmy, Harley & Twilight', production: 'Powerpuff Girls / Fairly OddParents / etc.', year: 1998, side: 'still', expected_subject: 'Bubbles, Timmy, Harley & Twilight',
  source_sha256s: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source.sha256])), exact_role_record_sha256: roleRecordReceipt.sha256,
  candidate_sha256: candidate.sha256, crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subjects', presentation_ruling: 'four-role-character-composite', crop_ruling: 'pass-four-panel-grid-layout',
  chronology_ruling: 'pass-1998-bubbles-chronology-separated-from-timmy-harley-and-twilight', resolution_ruling: 'pass-bubbles-controlled-historical-source-enlargement',
  reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role, reviewed_at: control.reviewed_at, canonical_mutation: false, disposition: 'reviewed-evidence-candidate', notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-126 reviewed Tara Strong four-role still candidate\n\n- **Record:** UC-126\n- **Performer:** Tara Strong\n- **Displayed roles:** Bubbles, Timmy Turner, Harley Quinn, and Twilight Sparkle\n- **Bubbles source:** \`${review.source_sha256s.bubbles}\`\n- **Timmy source:** \`${review.source_sha256s.timmy}\`\n- **Harley source:** \`${review.source_sha256s.harley}\`\n- **Twilight source:** \`${review.source_sha256s.twilight}\`\n- **Exact role record:** \`${roleRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** all four expected subjects\n- **Presentation ruling:** four-role character composite\n- **Crop ruling:** pass, two-by-two role grid\n- **Chronology ruling:** 1998 Bubbles chronology separated from Timmy, Harley, and Twilight\n- **Resolution ruling:** controlled Bubbles historical-source enlargement\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe selected source bytes, two strict actor-role receipts, three reference-only corroborations, four raw revisions, four browser transport receipts, deterministic composite, wall simulation, duplicate receipt, and exact-role record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);
const manifest = {
  version: 1, lane: 'card-backfill', record_id: 'UC-126', actor: 'Tara Strong', character: 'Bubbles, Timmy, Harley & Twilight', production: 'Powerpuff Girls / Fairly OddParents / etc.', year: 1998, side: 'still', expected_subject: 'Bubbles, Timmy, Harley & Twilight',
  reviewed_at: control.reviewed_at, reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact, bubbles_probe_artifact: control.bubbles_probe_artifact,
    failed_discovery_checkpoints: control.failed_discovery_checkpoints, discovery_repair_boundary: control.discovery_repair_boundary,
    render_control_sha256: sha(await readFile(CONTROL)), discovery_manifest_sha256: manifestReceipt.sha256, discovery_summary_sha256: summaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactReceipt.sha256, role_contact_sheet_sha256s: Object.fromEntries(Object.entries(roleContactReceipts).map(([key,row]) => [key,row.sha256])), render_artifact: null, apply_control_sha256: null
  },
  actor_role_custody: Object.fromEntries(actorRoleRows.map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider, source_page: row.page_url, binding: row.binding, strict: row.strict === true, reference_only: row.reference_only === true, externally_verified: row.externally_verified === true,
    ...(screenshot ? { body_sha256: row.body_sha256, page_screenshot: screenshot } : { runtime_transport: 'reference-only-external-verification' })
  }])),
  chronology_boundary: exactRoleRecord.composite_boundary,
  roles: Object.fromEntries(roleRows.map(({ role, source, raw, browser }) => [role.key, {
    role: role.role, display_label: role.display_label, provider: role.provider, source_page: role.page_url, api_title: role.api_title, page_id: role.page_id,
    raw_revision: raw, browser_transport_receipt: { ...browser, http_status: role.browser_http_status, title: role.browser_title, evidence_only: true },
    selected_asset_title: role.file_title, selected_source_url: role.declared_url, original: source,
    selection_ruling: role.selection_ruling, chronology_ruling: role.chronology_ruling, ...(role.resolution_ruling ? { resolution_ruling: role.resolution_ruling } : {})
  }])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate: { ...candidate, recipe: `Four ${control.render.panel_width}x${control.render.panel_height} panels in a two-by-two grid, ${control.render.vertical_divider_width}px vertical and ${control.render.horizontal_divider_height}px horizontal dividers, ${control.render.filter} scaling, JPEG quality ${control.render.jpeg_quality}` },
  crop_preview: { ...cropPreview, gravity: control.render.wall_gravity, semantics: 'The wall simulation removes seven pixels from each outside edge while preserving all four role identities, body silhouettes, chronology boundaries, and continuity rulings.' },
  rejected_orbit_summary: [
    'Blossom, Buttercup, the 2016 Powerpuff Girls reboot, Powerpuff Girls Z, live-action or future Timmy, unrelated Fairly OddParents characters, other Harley continuities or performers, Equestria Girls and non-Friendship-is-Magic Twilight variants, toys, games, posters, cosplay, merchandise, generic ensembles, and fan art were rejected.',
    'Reference-only Paramount, AWN, and Hasbro evidence was retained as corroboration and did not silently satisfy browser-runtime source gates.',
    'Six discovery checkpoints failed closed before the successful Bubbles transport probe and four-role orbit.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: { identity: review.identity_ruling, presentation: review.presentation_ruling, crop_ruling: review.crop_ruling, chronology_ruling: review.chronology_ruling, resolution_ruling: review.resolution_ruling, notes },
  disposition: 'reviewed-evidence-candidate', canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);
const packetNames = [
  'bubbles-original.webp','card-crop-preview.jpg','duplicate-scan.json','exact-role-record.json','harley-original.webp','manifest.json','review.json','review.md',
  'source-page-bubbles.png','source-page-dc-tara-strong-harley.png','source-page-harley.png','source-page-timmy.png','source-page-twilight.png','source-page-vanity-fair-tara-strong-roles.png',
  'source-wikitext-bubbles.txt','source-wikitext-harley.txt','source-wikitext-timmy.txt','source-wikitext-twilight.txt',
  'timmy-original.webp','twilight-original.webp','uc-126-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-126', sources: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source])), exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate, crop_preview: cropPreview, actor_role_pages: Object.fromEntries(actorRoleRows.filter(row => row.screenshot).map(({ control: row, screenshot }) => [row.key, screenshot])),
  role_page_receipts: Object.fromEntries(roleRows.map(({ role, browser, raw }) => [role.key, { browser, raw }])), repository_hash_count: repository.size,
  packet_files: [...packetNames, 'SHA256SUMS'], manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))), review_sha256: sha(await readFile(join(PACKET, 'review.json'))), sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))), canonical_mutation: false
});
console.log(`PASS — UC-126 exact four-role render packet created at ${PACKET}`);
for (const { role, source } of roleRows) console.log(`${role.key} ${source.sha256} ${source.width}x${source.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`role ${roleRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
