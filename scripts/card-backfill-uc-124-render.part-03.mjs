    caption: role.caption,
    source_link_id: role.source_link_id,
    selected_file_label: role.label,
    selected_source_url: role.declared_url,
    original: source,
    selection_ruling: role.selection_ruling
  }])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate: {
    ...candidate,
    recipe: `Two ${control.render.panel_width}x${control.render.panel_height} face-and-context panels, ${control.render.divider_width}px center divider, ${control.render.internal_rule_height}px internal rules, ${control.render.filter} scaling, JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside edge while preserving both roles, the voice-performance boundary, and full production context.'
  },
  rejected_orbit_summary: [
    'The 2019 photoreal Mufasa, later recast material, actor headshots, Disney Legends handprints, Simba-only images, and unrelated article graphics were rejected.',
    'Later Vader media, games, toys, posters, cosplay, unarmored Anakin, and any evidence claiming James Earl Jones occupied the suit were rejected.',
    'Two discovery checkpoints failed closed before the role-isolated exact D23 asset denominator succeeded.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: {
    identity: review.identity_ruling,
    presentation: review.presentation_ruling,
    crop_ruling: review.crop_ruling,
    chronology_ruling: review.chronology_ruling,
    embodiment_ruling: review.embodiment_ruling,
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
  'manifest.json',
  'mufasa-original.jpg',
  'review.json',
  'review.md',
  'source-page-d23-lion-king-1994-film.png',
  'source-page-d23-remembering-james-earl-jones.png',
  'source-page-disney-james-earl-jones.png',
  'source-page-starwars-james-earl-jones-vader.png',
  'uc-124-still-candidate.jpg',
  'vader-original.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-124',
  sources: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate,
  crop_preview: cropPreview,
  actor_role_pages: Object.fromEntries(actorRoleRows.map(({ control: row, screenshot }) => [row.key, screenshot])),
  shared_role_page: sharedRolePage,
  repository_hash_count: repository.size,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-124 exact two-role render packet created at ${PACKET}`);
for (const { role, source } of roleRows) console.log(`${role.key} ${source.sha256} ${source.width}x${source.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`role ${roleRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
