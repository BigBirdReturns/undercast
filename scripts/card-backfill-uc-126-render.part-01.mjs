const roleRows = [];
for (const role of control.roles) {
  const selected = (discoveryManifest.candidates || []).find(row => row.role_key === role.key && row.sha256 === role.sha256);
  assert(selected, `${role.key} selected discovery candidate missing`);
  assert(selected.local === role.artifact_path && selected.api_title === role.api_title && selected.file_title === role.file_title && selected.declared_url === role.declared_url, `${role.key} selected source custody drift`);
  assert(selected.mime === role.mime && selected.bytes === role.bytes && selected.width === role.width && selected.height === role.height && Array.isArray(selected.repository_matches) && selected.repository_matches.length === 0, `${role.key} selected source metadata or duplicate drift`);
  assert(!(repository.get(role.sha256) || []).length, `${role.key} selected source duplicates canonical media`);
  const api = discoveryManifest.api_evidence?.[role.key];
  assert(api && api.page_id === role.page_id && api.api_title !== null && api.retained_wikitext_sha256 === role.raw_wikitext_sha256 && api.retained_wikitext_bytes === role.raw_wikitext_bytes && api.required_wikitext_terms_missing.length === 0, `${role.key} raw revision custody drift`);
  const raw = await retain(role.raw_wikitext_artifact_path, role.raw_wikitext_output_path, { sha256: role.raw_wikitext_sha256, bytes: role.raw_wikitext_bytes });
  const browserEvidence = discoveryManifest.page_evidence?.[role.key];
  assert(browserEvidence && browserEvidence.screenshot?.sha256 === role.browser_sha256 && browserEvidence.screenshot?.bytes === role.browser_bytes && browserEvidence.screenshot?.width === role.browser_width && browserEvidence.screenshot?.height === role.browser_height, `${role.key} browser receipt drift`);
  const browser = await retain(role.browser_artifact_path, role.browser_output_path, { sha256: role.browser_sha256, mime: 'image/png', bytes: role.browser_bytes, width: role.browser_width, height: role.browser_height });
  const source = await retain(role.artifact_path, role.output_path, { sha256: role.sha256, mime: role.mime, bytes: role.bytes, width: role.width, height: role.height });
  roleRows.push({ role, selected, api, raw, browserEvidence, browser, source });
}
assert(new Set(roleRows.map(row => row.source.sha256)).size === 4, 'UC-126 selected role assets are not byte-distinct');

const exactRoleRecord = {
  version: 1,
  record_id: 'UC-126', actor: 'Tara Strong', character: 'Bubbles, Timmy, Harley & Twilight', production: 'Powerpuff Girls / Fairly OddParents / etc.', canonical_year: 1998,
  canonical_year_semantics: '1998 is original Powerpuff Girls and Bubbles chronology only. It is not projected onto Timmy Turner, Harley Quinn, or Twilight Sparkle.',
  performance_mode: 'voice',
  actor_role_bindings: Object.fromEntries(actorRoleRows.map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider, source_page: row.page_url, required_terms: row.required_terms, binding: row.binding,
    strict: row.strict === true, reference_only: row.reference_only === true, externally_verified: row.externally_verified === true,
    ...(screenshot ? { page_title: evidence.title, body_sha256: evidence.body_sha256, page_screenshot_sha256: screenshot.sha256 } : {})
  }])),
  roles: Object.fromEntries(roleRows.map(({ role, source, raw, browser, browserEvidence }) => [role.key, {
    role: role.role, display_label: role.display_label, provider: role.provider, source_page: role.page_url, api_title: role.api_title, page_id: role.page_id,
    raw_revision: raw, browser_transport_receipt: { ...browser, http_status: role.browser_http_status, title: role.browser_title, evidence_only: true },
    selected_asset_title: role.file_title, selected_source_url: role.declared_url, selected_image: source,
    selection_ruling: role.selection_ruling, chronology_ruling: role.chronology_ruling, ...(role.resolution_ruling ? { resolution_ruling: role.resolution_ruling } : {})
  }])),
  composite_boundary: {
    all_four_roles_required: true, selected_asset_count: 4, selected_assets_byte_distinct: true,
    original_1998_bubbles_required: true, tara_strong_timmy_main_series_required: true,
    named_dc_super_hero_girls_harley_continuity_required: true, friendship_is_magic_twilight_required: true,
    canonical_1998_is_bubbles_chronology_only: true, single_or_partial_role_candidate_forbidden: true
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), exactRoleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));
const byKey = Object.fromEntries(roleRows.map(row => [row.role.key, row]));
const panelPaths = {};
for (const key of ['bubbles','timmy','harley','twilight']) panelPaths[key] = join(OUT, `${key}-panel.jpg`);
magick(join(PACKET, byKey.bubbles.source.path), '-filter', control.render.filter, '-resize', control.render.bubbles_resize, '-unsharp', control.render.bubbles_unsharp, '-background', control.render.background, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.panel_height}`, '-strip', '-quality', String(control.render.jpeg_quality), panelPaths.bubbles);
magick(join(PACKET, byKey.timmy.source.path), '-background', control.render.background, '-alpha', 'background', '-filter', control.render.filter, '-resize', control.render.timmy_resize, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.panel_height}`, '-strip', '-quality', String(control.render.jpeg_quality), panelPaths.timmy);
magick(join(PACKET, byKey.harley.source.path), '-filter', control.render.filter, '-resize', control.render.harley_resize, '-gravity', control.render.harley_gravity, '-extent', `${control.render.panel_width}x${control.render.panel_height}`, '-strip', '-quality', String(control.render.jpeg_quality), panelPaths.harley);
magick(join(PACKET, byKey.twilight.source.path), '-filter', control.render.filter, '-resize', control.render.twilight_resize, '-background', control.render.background, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.panel_height}`, '-strip', '-quality', String(control.render.jpeg_quality), panelPaths.twilight);
for (const [key, path] of Object.entries(panelPaths)) assert(JSON.stringify(identify(path)) === JSON.stringify({ width: control.render.panel_width, height: control.render.panel_height }), `UC-126 ${key} panel geometry drift`);
const topPath = join(OUT, 'top-row.jpg');
const bottomPath = join(OUT, 'bottom-row.jpg');
magick(panelPaths.bubbles, '-size', `${control.render.vertical_divider_width}x${control.render.panel_height}`, `xc:${control.render.rule_color}`, panelPaths.timmy, '+append', topPath);
magick(panelPaths.harley, '-size', `${control.render.vertical_divider_width}x${control.render.panel_height}`, `xc:${control.render.rule_color}`, panelPaths.twilight, '+append', bottomPath);
const candidatePath = join(PACKET, 'uc-126-still-candidate.jpg');
magick(topPath, '-size', `${control.render.candidate_width}x${control.render.horizontal_divider_height}`, `xc:${control.render.rule_color}`, bottomPath, '-append', '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-126-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };
const duplicateItems = [
  ...roleRows.map(({ role, source }) => ({ label: `${role.display_label} selected source`, path: source.path, sha256: source.sha256, matches: repository.get(source.sha256) || [] })),
  { label: 'UC-126 four-role candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-126 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-126 exact-byte duplicate detected');
await writeJson(join(PACKET, 'duplicate-scan.json'), { version: 1, repository_hash_count: repository.size, items: duplicateItems, reviewed_at: control.reviewed_at, reviewed_by: control.reviewed_by, status: 'pass', semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.' });
const notes = [
  'Tara Strong directly identifies Bubbles, Timmy Turner, Harley Quinn, and Twilight Sparkle among her performed voices. DC independently fixes Harley to the 2019 DC Super Hero Girls continuity; Paramount, AWN, and Hasbro remain separately retained corroboration.',
  'The canonical 1998 field remains original Powerpuff Girls and Bubbles chronology only. Timmy, Harley, and Twilight carry independent production and role custody.',
  'Bubbles uses a 185x185 original-series action image from the hash-pinned Bubbles probe. Its crisp flat-color line art remains legible after controlled Lanczos enlargement; no claim of newly recovered detail is made.',
  'Timmy uses a clean main-series character stock image. Harley uses a named 2019 DC Super Hero Girls S01E09 frame. Twilight uses a Friendship is Magic S4E26 identity frame.',
  'The 1260x1000 layout uses four 624x494 role panels separated by twelve-pixel neutral dividers. All four faces and body silhouettes remain independently legible.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing any role, chronology, or continuity ruling.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
