const roleRows = [];
for (const role of control.roles) {
  const selected = (discoveryManifest.candidates || []).find(row => row.role_key === role.key && row.sha256 === role.sha256);
  assert(selected, `${role.key} selected discovery candidate missing`);
  assert(selected.local === role.artifact_path && selected.source_page_key === role.source_page_key && selected.source_page === role.page_url && selected.declared_url === role.declared_url, `${role.key} selected source custody drift`);
  assert(selected.asset_title === role.asset_title && selected.role_history === role.role_history && selected.mime === role.mime && selected.bytes === role.bytes && selected.width === role.width && selected.height === role.height, `${role.key} selected source metadata drift`);
  assert(selected.official_direct_asset === true && Array.isArray(selected.repository_matches) && selected.repository_matches.length === 0, `${role.key} official source or duplicate custody drift`);
  assert(!(repository.get(role.sha256) || []).length, `${role.key} selected source duplicates canonical media`);
  assert(role.generic_width_floor_exception === true && role.width === 240 && role.width < 250, `${role.key} official width exception drift`);
  const source = await retain(role.artifact_path, role.output_path, { sha256: role.sha256, mime: role.mime, bytes: role.bytes, width: role.width, height: role.height });
  roleRows.push({ role, source, selected });
}
assert(new Set(roleRows.map(row => row.source.sha256)).size === 3, 'UC-125 selected role assets are not byte-distinct');

const exactRoleRecord = {
  version: 1,
  record_id: 'UC-125',
  actor: 'Billy West',
  character: 'Ren, Stimpy & Fry',
  production: 'Ren & Stimpy / Futurama',
  canonical_year: 1991,
  canonical_year_semantics: 'Ren & Stimpy-era chronology only; it is not Futurama or Philip J. Fry debut chronology and does not imply West voiced Ren at the 1991 series debut.',
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
  roles: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    source_page_key: role.source_page_key,
    selected_asset_title: role.asset_title,
    selected_source_url: role.declared_url,
    selected_image_sha256: source.sha256,
    selected_image_width: source.width,
    selected_image_height: source.height,
    role_history: role.role_history,
    generic_width_floor_exception: role.generic_width_floor_exception,
    floor_exception_ruling: role.floor_exception_ruling,
    selection_ruling: role.selection_ruling
  }])),
  composite_boundary: {
    all_three_roles_required: true,
    selected_asset_count: 3,
    selected_assets_byte_distinct: true,
    official_billy_west_role_history_required: true,
    ren_1993_takeover_boundary_required: true,
    stimpy_1991_role_boundary_required: true,
    fry_1999_role_boundary_required: true,
    canonical_1991_is_ren_and_stimpy_chronology_not_fry_debut: true,
    official_source_width_exceptions: 3,
    official_source_width_pixels: 240,
    generic_source_width_floor_pixels: 250,
    single_role_or_two_role_candidate_forbidden: true
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), exactRoleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const roleByKey = Object.fromEntries(roleRows.map(row => [row.role.key, row]));
const faceCrop = {
  ren: [control.render.ren_face_crop_width, control.render.ren_face_crop_height, control.render.ren_face_crop_x, control.render.ren_face_crop_y],
  stimpy: [control.render.stimpy_face_crop_width, control.render.stimpy_face_crop_height, control.render.stimpy_face_crop_x, control.render.stimpy_face_crop_y],
  fry: [control.render.fry_face_crop_width, control.render.fry_face_crop_height, control.render.fry_face_crop_x, control.render.fry_face_crop_y]
};
const panels = {};
for (const key of ['ren','stimpy','fry']) {
  const sourcePath = join(PACKET, roleByKey[key].source.path);
  const [cropWidth, cropHeight, cropX, cropY] = faceCrop[key];
  const facePath = join(OUT, `${key}-face.jpg`);
  const bodyPath = join(OUT, `${key}-body.jpg`);
  const panelPath = join(OUT, `${key}-panel.jpg`);
  magick(sourcePath, '-auto-orient', '-crop', `${cropWidth}x${cropHeight}+${cropX}+${cropY}`, '+repage', '-filter', control.render.filter, '-resize', `${control.render.panel_width}x${control.render.face_height}^`, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.face_height}`, '-strip', '-quality', String(control.render.jpeg_quality), facePath);
  magick(sourcePath, '-auto-orient', '-filter', control.render.filter, '-resize', `${control.render.panel_width}x${control.render.body_height}>`, '-background', control.render.body_background, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.body_height}`, '-strip', '-quality', String(control.render.jpeg_quality), bodyPath);
  magick(facePath, '-size', `${control.render.panel_width}x${control.render.internal_rule_height}`, `xc:${control.render.rule_color}`, bodyPath, '-append', panelPath);
  assert(JSON.stringify(identify(panelPath)) === JSON.stringify({ width: control.render.panel_width, height: control.render.panel_height }), `UC-125 ${key} panel geometry drift`);
  panels[key] = panelPath;
}

const candidatePath = join(PACKET, 'uc-125-still-candidate.jpg');
magick(panels.ren, '-size', `${control.render.divider_width}x${control.render.candidate_height}`, `xc:${control.render.rule_color}`, panels.stimpy, '-size', `${control.render.divider_width}x${control.render.candidate_height}`, `xc:${control.render.rule_color}`, panels.fry, '+append', '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-125-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };

const duplicateItems = [
  ...roleRows.map(({ role, source }) => ({ label: `${role.display_label} selected source`, path: source.path, sha256: source.sha256, matches: repository.get(source.sha256) || [] })),
  { label: 'UC-125 three-role candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-125 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-125 exact-byte duplicate detected');
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
  'Billy West’s current official site identifies him with Ren, Stimpy, and Philip J. Fry. His official role history separately fixes Stimpy to the 1991 series start, Ren to 1993-1996, and Fry to Futurama beginning in 1999.',
  'Paramount independently fixes The Ren & Stimpy Show to 1991 and lists Billy West among the featured cast. Hulu independently fixes Billy West to the Futurama series and its current production.',
  'The canonical 1991 field remains Ren & Stimpy-era chronology. It does not claim that West voiced Ren at the original debut and is not projected onto Fry or Futurama.',
  'Ren, Stimpy, and Fry use the three exact role-labeled Billy West official image assets. Each source is 240 pixels wide and receives an explicit ten-pixel official-source width exception because its isolated line art preserves a crisp face and complete figure.',
  'Each 412-pixel panel presents a large face crop above the complete character. Twelve-pixel dividers and eight-pixel internal rules preserve all three role identities.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing the Ren, Stimpy, or Fry identity, body, or chronology ruling.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
