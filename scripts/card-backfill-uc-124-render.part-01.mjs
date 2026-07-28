const discoverySummary = await readJson(discoverySummaryPath);
assert(discoveryManifest.record_id === 'UC-124' && discoveryManifest.actor === 'James Earl Jones' && discoveryManifest.character === 'Mufasa (and Darth Vader)' && discoveryManifest.production === 'The Lion King / Star Wars', 'UC-124 discovery manifest identity drift');
assert(discoveryManifest.candidate_count === 2 && JSON.stringify(discoveryManifest.role_counts) === JSON.stringify({ mufasa: 1, vader: 1 }), 'UC-124 discovery candidate denominator drift');
assert(discoverySummary.candidate_count === 2 && JSON.stringify(discoverySummary.role_counts) === JSON.stringify({ mufasa: 1, vader: 1 }), 'UC-124 discovery summary denominator drift');
assert(discoveryManifest.failed_discovery_checkpoints?.length === 2 && discoveryManifest.identity_boundary?.darth_vader_frame_must_not_imply_jones_suit_occupancy === true, 'UC-124 discovery custody or identity boundary drift');

const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const actorRoleRows = [];
for (const row of control.actor_role_custody) {
  const evidence = evidenceByKey(discoveryManifest, row.key);
  verifyEvidence(evidence, row, row.key);
  const screenshot = await retain(row.artifact_path, row.output_path, { sha256: row.sha256, mime: 'image/png', bytes: row.bytes, width: row.width, height: row.height });
  actorRoleRows.push({ control: row, evidence, screenshot });
}

const sharedEvidenceMufasa = evidenceByKey(discoveryManifest, 'd23-remembering-mufasa');
const sharedEvidenceVader = evidenceByKey(discoveryManifest, 'd23-remembering-vader');
verifyEvidence(sharedEvidenceMufasa, control.shared_role_page, 'shared D23 Mufasa role page');
verifyEvidence(sharedEvidenceVader, control.shared_role_page, 'shared D23 Vader role page');
assert(sharedEvidenceMufasa.screenshot.sha256 === sharedEvidenceVader.screenshot.sha256, 'shared D23 role-page byte drift');
const sharedRolePage = await retain(control.shared_role_page.artifact_path, control.shared_role_page.output_path, { sha256: control.shared_role_page.sha256, mime: 'image/png', bytes: control.shared_role_page.bytes, width: control.shared_role_page.width, height: control.shared_role_page.height });

const roleRows = [];
for (const role of control.roles) {
  const evidence = evidenceByKey(discoveryManifest, role.source_page_key);
  assert(JSON.stringify(evidence.required_terms) === JSON.stringify(role.required_terms) && evidence.required_terms_missing.length === 0, `${role.key} role-page term drift`);
  const selected = (discoveryManifest.candidates || []).find(row => row.role_key === role.key && row.sha256 === role.sha256);
  assert(selected, `${role.key} selected discovery candidate missing`);
  assert(selected.local === role.artifact_path && selected.source_page_key === role.source_page_key && selected.source_page === role.page_url && selected.declared_url === role.declared_url, `${role.key} selected source custody drift`);
  assert(selected.label === role.label && selected.mime === role.mime && selected.bytes === role.bytes && selected.width === role.width && selected.height === role.height, `${role.key} selected source metadata drift`);
  assert(selected.direct_asset === true && selected.externally_verified === true && selected.source_link_id === role.source_link_id && selected.caption_match === true, `${role.key} direct-asset custody drift`);
  assert(Array.isArray(selected.repository_matches) && selected.repository_matches.length === 0, `${role.key} selected discovery duplicate drift`);
  assert(!(repository.get(role.sha256) || []).length, `${role.key} selected source duplicates canonical media`);
  const source = await retain(role.artifact_path, role.output_path, { sha256: role.sha256, mime: role.mime, bytes: role.bytes, width: role.width, height: role.height });
  roleRows.push({ role, evidence, source, selected });
}
assert(new Set(roleRows.map(row => row.source.sha256)).size === 2, 'UC-124 selected role assets are not byte-distinct');

const exactRoleRecord = {
  version: 1,
  record_id: 'UC-124',
  actor: 'James Earl Jones',
  character: 'Mufasa (and Darth Vader)',
  production: 'The Lion King / Star Wars',
  canonical_year: 1994,
  canonical_year_semantics: 'Animated Mufasa and The Lion King chronology only; it is not Darth Vader debut or James Earl Jones Vader voice-start chronology.',
  performance_mode: 'voice',
  actor_role_bindings: Object.fromEntries(actorRoleRows.map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider,
    source_page: row.page_url,
    page_title: evidence.title,
    required_terms: row.required_terms,
    body_sha256: row.body_sha256,
    page_screenshot_sha256: screenshot.sha256,
    binding: row.binding
  }])),
  shared_role_page: {
    provider: control.shared_role_page.provider,
    source_page: control.shared_role_page.page_url,
    page_title: control.shared_role_page.page_title,
    body_sha256: control.shared_role_page.body_sha256,
    page_screenshot_sha256: sharedRolePage.sha256
  },
  roles: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    source_page_key: role.source_page_key,
    selected_file_label: role.label,
    selected_source_url: role.declared_url,
    caption: role.caption,
    selected_image_sha256: source.sha256,
    selected_image_width: source.width,
    selected_image_height: source.height,
    selection_ruling: role.selection_ruling
  }])),
  composite_boundary: {
    both_roles_required: true,
    selected_asset_count: 2,
    selected_assets_byte_distinct: true,
    original_1994_animated_mufasa_required: true,
    original_trilogy_vader_required: true,
    james_earl_jones_voice_binding_required_for_each_role: true,
    voice_and_physical_embodiment_separate: true,
    darth_vader_frame_must_not_imply_jones_suit_occupancy: true,
    physical_vader_performance_separately_credited_to_david_prowse: true,
    canonical_1994_is_lion_king_chronology_not_vader_debut: true,
    single_role_candidate_forbidden: true
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), exactRoleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const mufasaSource = join(PACKET, 'mufasa-original.jpg');
const vaderSource = join(PACKET, 'vader-original.jpg');
const mufasaFace = join(OUT, 'mufasa-face.jpg');
const vaderFace = join(OUT, 'vader-face.jpg');
const mufasaContext = join(OUT, 'mufasa-context.jpg');
const vaderContext = join(OUT, 'vader-context.jpg');
const mufasaPanel = join(OUT, 'mufasa-panel.jpg');
const vaderPanel = join(OUT, 'vader-panel.jpg');

magick(mufasaSource, '-auto-orient', '-crop', `${control.render.mufasa_face_crop_width}x${control.render.mufasa_face_crop_height}+${control.render.mufasa_face_crop_x}+${control.render.mufasa_face_crop_y}`, '+repage', '-filter', control.render.filter, '-resize', `${control.render.panel_width}x${control.render.face_height}^`, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.face_height}`, '-strip', '-quality', String(control.render.jpeg_quality), mufasaFace);
magick(vaderSource, '-auto-orient', '-crop', `${control.render.vader_face_crop_width}x${control.render.vader_face_crop_height}+${control.render.vader_face_crop_x}+${control.render.vader_face_crop_y}`, '+repage', '-filter', control.render.filter, '-resize', `${control.render.panel_width}x${control.render.face_height}^`, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.face_height}`, '-strip', '-quality', String(control.render.jpeg_quality), vaderFace);
magick(mufasaSource, '-auto-orient', '-filter', control.render.filter, '-resize', `${control.render.panel_width}x${control.render.context_height}>`, '-background', control.render.rule_color, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.context_height}`, '-strip', '-quality', String(control.render.jpeg_quality), mufasaContext);
magick(vaderSource, '-auto-orient', '-filter', control.render.filter, '-resize', `${control.render.panel_width}x${control.render.context_height}>`, '-background', control.render.rule_color, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.context_height}`, '-strip', '-quality', String(control.render.jpeg_quality), vaderContext);
magick(mufasaFace, '-size', `${control.render.panel_width}x${control.render.internal_rule_height}`, `xc:${control.render.rule_color}`, mufasaContext, '-append', mufasaPanel);
