magick(vaderFace, '-size', `${control.render.panel_width}x${control.render.internal_rule_height}`, `xc:${control.render.rule_color}`, vaderContext, '-append', vaderPanel);
assert(JSON.stringify(identify(mufasaPanel)) === JSON.stringify({ width: control.render.panel_width, height: control.render.panel_height }), 'UC-124 Mufasa panel geometry drift');
assert(JSON.stringify(identify(vaderPanel)) === JSON.stringify({ width: control.render.panel_width, height: control.render.panel_height }), 'UC-124 Vader panel geometry drift');

const candidatePath = join(PACKET, 'uc-124-still-candidate.jpg');
magick(mufasaPanel, '-size', `${control.render.divider_width}x${control.render.candidate_height}`, `xc:${control.render.rule_color}`, vaderPanel, '+append', '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-124-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };

const duplicateItems = [
  ...roleRows.map(({ role, source }) => ({ label: `${role.display_label} selected source`, path: source.path, sha256: source.sha256, matches: repository.get(source.sha256) || [] })),
  { label: 'UC-124 two-role candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-124 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-124 exact-byte duplicate detected');
const duplicateScan = {
  version: 1,
  repository_hash_count: repository.size,
  items: duplicateItems,
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  status: 'pass',
  semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
};
await writeJson(join(PACKET, 'duplicate-scan.json'), duplicateScan);

const notes = [
  'The Walt Disney Company independently binds James Earl Jones to both animated Mufasa and the voice of Darth Vader; Lucasfilm separately credits David Prowse for Vader’s physical performance, and the D23 film record fixes the original animated Lion King to 1994.',
  'Mufasa uses the exact D23 caption-local 1994 animated scene beside Simba. Vader uses the exact D23 caption-local Empire Strikes Back armored-character scene.',
  'The canonical 1994 field remains Mufasa and The Lion King chronology. It is not used as Darth Vader debut or James Earl Jones Vader voice-start evidence.',
  'Each 624-pixel panel presents a close identity field above the complete production frame. The twelve-pixel center divider and eight-pixel internal rules preserve role separation and visual context.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing Mufasa’s face and paternal scene context or Vader’s helmet, mask, chest controls, cape, body, and hand gesture.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review = {
  version: 1,
  record_id: 'UC-124',
  actor: 'James Earl Jones',
  character: 'Mufasa (and Darth Vader)',
  production: 'The Lion King / Star Wars',
  year: 1994,
  side: 'still',
  expected_subject: 'Mufasa (and Darth Vader)',
  source_sha256s: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source.sha256])),
  exact_role_record_sha256: roleRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subjects',
  presentation_ruling: 'two-role-voice-character-composite',
  crop_ruling: 'pass-two-panel-face-and-context-layout',
  chronology_ruling: 'pass-1994-lion-king-chronology-separated-from-vader-history',
  embodiment_ruling: 'pass-jones-voice-separated-from-vader-suit-occupancy',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-124 reviewed James Earl Jones two-role still candidate\n\n- **Record:** UC-124\n- **Performer:** James Earl Jones\n- **Displayed roles:** Mufasa and Darth Vader\n- **Productions:** The Lion King / Star Wars\n- **Mufasa source:** \`${review.source_sha256s.mufasa}\`\n- **Darth Vader source:** \`${review.source_sha256s.vader}\`\n- **Exact role record:** \`${roleRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** both expected subjects\n- **Presentation ruling:** two-role voice-character composite\n- **Crop ruling:** pass, two face-and-context panels\n- **Chronology ruling:** 1994 Lion King chronology separated from Vader history\n- **Embodiment ruling:** Jones voice separated from Vader suit occupancy\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe two selected sources, Disney, Lucasfilm, and D23 role spines, shared source-page receipt, deterministic composite, wall simulation, duplicate receipt, and exact-role record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-124',
  actor: 'James Earl Jones',
  character: 'Mufasa (and Darth Vader)',
  production: 'The Lion King / Star Wars',
  year: 1994,
  side: 'still',
  expected_subject: 'Mufasa (and Darth Vader)',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    failed_discovery_checkpoints: discoveryManifest.failed_discovery_checkpoints,
    discovery_repair_boundary: discoveryManifest.discovery_repair_boundary,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: manifestReceipt.sha256,
    discovery_summary_sha256: summaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactReceipt.sha256,
    role_contact_sheet_sha256s: { mufasa: mufasaContactReceipt.sha256, vader: vaderContactReceipt.sha256 },
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
  shared_role_page: {
    provider: control.shared_role_page.provider,
    source_page: control.shared_role_page.page_url,
    body_sha256: control.shared_role_page.body_sha256,
    page_screenshot: sharedRolePage
  },
  identity_boundary: exactRoleRecord.composite_boundary,
  roles: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    source_page_key: role.source_page_key,
