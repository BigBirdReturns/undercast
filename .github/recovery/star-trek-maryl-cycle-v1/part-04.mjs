      performance_mode: 'physical-prosthetic',
      original_maryl_body_inferred: false,
      erica_mer_reflection_conflated: false,
      maker_attribution: 'unresolved',
    },
    lease: {
      id: batch.lease_id,
      claim_event_id: claimEvent.id,
      claimed_at: batch.claimed_at,
      expires_at: batch.expires_at,
      readiness_token: batch.readiness.lease_token,
      selection: batch.selection,
    },
    wall_id: card.id,
    card_sha256: sha(Buffer.from(stablePretty(finalCard))),
    source_ledger_sha256: sha(Buffer.from(stablePretty(source))),
    media_facets_sha256: sha(Buffer.from(stablePretty(auditItems))),
    media: {
      still_path: finalCard.still.src,
      still_origin: finalCard.still.origin,
      still_sha256: shaFile(finalCard.still.src),
      portrait_path: finalCard.portrait.src,
      portrait_origin: finalCard.portrait.origin,
      portrait_sha256: shaFile(finalCard.portrait.src),
      portrait_author: finalCard.portrait.author,
      portrait_license: finalCard.portrait.license,
    },
    queue: counts,
    media_review_sha256: current.outcome.review_sha256,
    canonical_mutation: false,
  };
  const stageReceipt = { ...stageBody, receipt_sha256: sha(Buffer.from(stablePretty(stageBody))) };
  writeJson(path.join(stageRoot, 'stage.json'), stageReceipt);
  fs.copyFileSync('.luna/batch.json', path.join(stageRoot, 'batch.json'));
  fs.copyFileSync('.luna/results.json', path.join(stageRoot, 'results.json'));
  fs.copyFileSync(findOne(mediaRoot, 'visual-review.json'), path.join(stageRoot, 'source-media-visual-review.json'));
  fs.copyFileSync(findOne(mediaRoot, 'locator.json'), path.join(stageRoot, 'source-media-locator.json'));
  console.log(JSON.stringify({ status: 'staged', wall_id: card.id, lease_id: batch.lease_id, stage_receipt_sha256: stageReceipt.receipt_sha256, portrait_sha256: media.portraitSha }, null, 2));
}

function verifyCandidate(stageDoc) {
  ensure(stageDoc.transaction === 'STAR-TREK-MARYL-CANDIDATE-STAGE-V1' && stageDoc.canonical_parent === EXPECTED_MAIN, 'Maryl stage receipt identity drifted');
  const stageBody = { ...stageDoc }; delete stageBody.receipt_sha256;
  ensure(stageDoc.receipt_sha256 === sha(Buffer.from(stablePretty(stageBody))), 'Maryl stage receipt hash drifted');
  const { task } = taskRow();
  ensure(task.status === 'resolved' && task.performer === PERFORMER && task.character === CHARACTER && task.source_fingerprint === SOURCE_FINGERPRINT, 'Maryl task state drifted');
  ensure(task.performance_modes?.length === 1 && task.performance_modes[0] === 'physical-prosthetic', 'Maryl task mode drifted');
  ensure(task.wall_ids?.length === 1 && task.wall_ids[0] === stageDoc.wall_id, 'Maryl task wall binding drifted');
  ensure(task.outcome?.review_sha256 === stageDoc.media_review_sha256, 'Maryl media review binding drifted');
  const card = readJson('data/specimens.json').find((row) => row.id === stageDoc.wall_id);
  ensure(card && card.actor === PERFORMER && card.character === CHARACTER && card.production === PRODUCTION && card.universe === 'Star Trek' && card.years === YEARS && card.designer === '—' && card.transform === 2, 'Maryl card fields drifted');
  ensure(!('kind' in card), 'Maryl physical card must not carry voice kind');
  ensure(card.knownFor === KNOWN_FOR && card.reveal === REVEAL && card.link === SOURCE, 'Maryl card copy drifted');
  ensure(card.reveal.includes('Erica Mer') && card.reveal.includes('original Human body') && card.reveal.includes('remain unresolved'), 'Maryl identity boundary copy drifted');
  ensure(card.references?.some((row) => row.claim === 'performance' && sourceKey(row.source) === sourceKey(SOURCE)), 'Maryl performance reference missing');
  ensure(card.references?.some((row) => row.claim === 'production' && sourceKey(row.source) === sourceKey(EPISODE_SOURCE)), 'Maryl production reference missing');
  ensure(card.still?.origin === STILL_ORIGIN && shaFile(card.still.src) === STILL_SHA256, 'Maryl still drifted');
  ensure(card.portrait?.origin === PORTRAIT_ORIGIN && /Brian Wilkins/i.test(card.portrait.author || '') && /CC BY 2\.0/i.test(card.portrait.license || ''), 'Maryl portrait provenance drifted');
  ensure(shaFile(card.portrait.src) === stageDoc.media.portrait_sha256, 'Maryl portrait bytes drifted');
  ensure(shaFile(card.portrait.src) !== shaFile('images/uc-037-portrait.jpg') && shaFile(card.portrait.src) !== shaFile('images/uc-1392-portrait.jpg'), 'Maryl portrait duplicates prior Jeri Ryan asset');
  ensure(card.still.origin !== REJECTED_ORIGIN && shaFile(card.still.src) !== REJECTED_SHA256, 'Erica Mer reflection was substituted into Jeri Ryan card');
  const source = readJson('data/SOURCES.json').find((row) => row.id === stageDoc.wall_id);
  ensure(source && JSON.stringify(source.still) === JSON.stringify(card.still) && JSON.stringify(source.portrait) === JSON.stringify(card.portrait) && source.fetched_at, 'Maryl source ledger drifted');
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === stageDoc.wall_id).sort((a, b) => a.side.localeCompare(b.side));
  ensure(facets.length === 2 && facets.every((row) => row.status === 'verified'), 'Maryl media facets are not verified');
  ensure(facets.find((row) => row.side === 'still')?.asset?.sha256 === STILL_SHA256, 'Maryl still facet drifted');
  ensure(facets.find((row) => row.side === 'portrait')?.asset?.sha256 === stageDoc.media.portrait_sha256, 'Maryl portrait facet drifted');
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify({ total: 2228, queued: 1801, resolved: 425, blocked: 0, rejected: 2, in_flight: 0 }), `Maryl candidate queue drifted: ${JSON.stringify(counts)}`);
  return { task, card, source, facets, counts };
}

function review() {
  const stageRoot = env.STAGE_ROOT;
  const reviewRoot = env.REVIEW_ROOT;
  ensure(stageRoot && reviewRoot, 'review requires STAGE_ROOT and REVIEW_ROOT');
  fs.mkdirSync(reviewRoot, { recursive: true });
  const stageDoc = readJson(path.join(stageRoot, 'stage.json'));
  const verified = verifyCandidate(stageDoc);
  node(PRIOR_CHECKER_PATH);
  node('scripts/validate.mjs');
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  node('scripts/thesis-rails.mjs', ['validate']);
  const waterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  ensure(waterline.phase === 'receipt-required', 'Maryl independent review expected receipt-required waterline');
  const body = {
    version: 1,
    transaction: 'STAR-TREK-MARYL-INDEPENDENT-REVIEW-V1',
    verdict: 'pass',
    canonical_parent: EXPECTED_MAIN,
    candidate: {
      commit: env.CANDIDATE_COMMIT,
      tree: env.CANDIDATE_TREE,
      path_count: Number(env.CANDIDATE_PATH_COUNT),
      path_ledger_sha256: env.CANDIDATE_PATH_LEDGER_SHA256,
    },
    task: {
      id: TASK_ID,
      performer: PERFORMER,
      role: CHARACTER,
