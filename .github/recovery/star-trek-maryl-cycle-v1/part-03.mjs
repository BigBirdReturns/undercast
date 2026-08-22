  ensure(mediaRoot && stageRoot, 'stage requires MEDIA_ROOT and STAGE_ROOT');
  fs.mkdirSync(stageRoot, { recursive: true });
  const sourceProof = verifyPinnedSource(mediaRoot);

  node(PRIOR_CHECKER_PATH);
  node('scripts/thesis-rails.mjs', ['validate']);
  const next = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(next.phase === 'ready-for-one-cycle' && next.candidate?.task_id === TASK_ID && next.candidate?.source_fingerprint === SOURCE_FINGERPRINT, 'thesis rail did not select Maryl');
  writeJson(path.join(stageRoot, 'thesis-next.json'), next);

  fs.rmSync('.luna', { recursive: true, force: true });
  npm(['run', 'autopilot', '--', 'next', '--agent', 'chatgpt-star-trek-maryl', '--scope', 'star-trek', '--capability-profile', 'text-vision', '--limit', '1', '--lease-minutes', '1440', '--out', '.luna/batch.json', '--prompt', '.luna/AUTOPILOT-PROMPT.md']);
  const batch = readJson('.luna/batch.json');
  ensure(batch.tasks?.length === 1 && batch.tasks[0].id === TASK_ID && batch.tasks[0].source_fingerprint === SOURCE_FINGERPRINT, 'Maryl lease packet drifted');
  const results = {
    version: 1,
    lease_id: batch.lease_id,
    agent: batch.agent,
    results: [{ task_id: TASK_ID, decision: 'draft', draft: buildDraft() }],
  };
  writeJson('.luna/results.json', results);
  npm(['run', 'autopilot', '--', 'submit', '--batch', '.luna/batch.json', '--input', '.luna/results.json']);
  node('scripts/grow.mjs', ['--drafts']);

  const { card } = cardRow();
  const media = patchCardAndLedger(card.id, sourceProof.still);
  node('scripts/credits.mjs');
  node('scripts/sync-sources.mjs');
  node('scripts/needs.mjs');
  node('scripts/shard.mjs');
  node('scripts/build-contract.mjs');
  node('scripts/build-record-pages.mjs');
  npm(['run', 'autopilot', '--', 'sync']);

  let current = taskRow().task;
  ensure(current.status === 'merged' && current.role_on_wall === true && current.wall_ids?.length === 1 && current.wall_ids[0] === card.id, 'Maryl task did not enter merged review state');

  npm(['run', 'media:audit', '--', 'sync']);
  const reviewedAt = new Date().toISOString();
  const resolution = buildMediaResolution(card.id, reviewedAt);
  writeJson(path.join(stageRoot, 'media-resolution.json'), resolution);
  npm(['run', 'media:audit', '--', 'resolve', '--input', path.join(stageRoot, 'media-resolution.json')]);
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);

  const sourceLedger = readJson('data/SOURCES.json').find((row) => row.id === card.id);
  ensure(sourceLedger?.still?.origin === STILL_ORIGIN && sourceLedger?.portrait?.origin === PORTRAIT_ORIGIN, 'Maryl source ledger media drifted');
  const mediaReview = {
    version: 1,
    reviewed_by: 'chatgpt-maryl-second-desk',
    lease_id: batch.lease_id,
    reviews: [{
      task_id: TASK_ID,
      records: [{
        wall_id: card.id,
        still: {
          disposition: 'verified',
          subject: CHARACTER,
          source: STILL_ORIGIN,
          note: 'The pinned frame is captioned Seven as Maryl and depicts Jeri Ryan’s frightened-child performance through Seven of Nine.',
        },
        portrait: {
          disposition: 'verified',
          subject: PERFORMER,
          source: PORTRAIT_ORIGIN,
          note: 'The licensed portrait identifies Jeri Ryan as a neutral human performer and is distinct from the character frame.',
        },
      }],
    }],
  };
  writeJson(path.join(stageRoot, 'media-review.json'), mediaReview);
  npm(['run', 'autopilot', '--', 'complete', '--input', path.join(stageRoot, 'media-review.json')]);

  node('scripts/validate.mjs');
  node('scripts/thesis-rails.mjs', ['validate']);
  node(PRIOR_CHECKER_PATH);

  current = taskRow().task;
  ensure(current.status === 'resolved' && current.wall_ids?.[0] === card.id, 'Maryl task did not resolve');
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify({ total: 2228, queued: 1801, resolved: 425, blocked: 0, rejected: 2, in_flight: 0 }), `Maryl terminal queue drifted: ${JSON.stringify(counts)}`);
  const waterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  ensure(waterline.phase === 'receipt-required', `Maryl candidate waterline phase is ${waterline.phase}`);
  ensure((Array.isArray(waterline.cycles?.unreceipted) ? waterline.cycles.unreceipted.length : waterline.cycles?.unreceipted) === 1, 'Maryl candidate must have exactly one unreceipted cycle');
  writeJson(path.join(stageRoot, 'waterline-before-receipt.json'), waterline);

  const auditItems = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === card.id).sort((a, b) => a.side.localeCompare(b.side));
  const source = readJson('data/SOURCES.json').find((row) => row.id === card.id);
  const finalCard = readJson('data/specimens.json').find((row) => row.id === card.id);
  const claimEvent = readJsonl('data/journal/autopilot.jsonl').find((row) => row.op === 'lease.claimed' && row.task_id === TASK_ID && row.lease_id === batch.lease_id);
  ensure(claimEvent, 'Maryl claim event missing');
  const stageBody = {
    version: 1,
    transaction: 'STAR-TREK-MARYL-CANDIDATE-STAGE-V1',
    canonical_parent: EXPECTED_MAIN,
    task: {
      id: TASK_ID,
      performer: PERFORMER,
      role: CHARACTER,
      source: SOURCE,
      source_fingerprint: SOURCE_FINGERPRINT,
