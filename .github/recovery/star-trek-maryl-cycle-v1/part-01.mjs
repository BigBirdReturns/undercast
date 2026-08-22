}

function queueCounts() {
  const trek = readJson('data/AUTOPILOT.json').jobs.filter((row) => row.scope === 'star-trek');
  return {
    total: trek.length,
    queued: trek.filter((row) => row.status === 'queued').length,
    resolved: trek.filter((row) => row.status === 'resolved').length,
    blocked: trek.filter((row) => row.status === 'blocked').length,
    rejected: trek.filter((row) => row.status === 'rejected').length,
    in_flight: trek.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length,
  };
}

function verifyPinnedSource(mediaRoot) {
  const visual = readJson(findOne(mediaRoot, 'visual-review.json'));
  ensure(visual.verdict === 'pass', 'Maryl visual review is not pass');
  ensure(visual.canonical_parent === MEDIA_CANONICAL_PARENT, 'Maryl media canonical parent drifted');
  ensure(visual.task_id === TASK_ID && visual.source_fingerprint === SOURCE_FINGERPRINT, 'Maryl visual review identity drifted');
  ensure(visual.target?.performer === PERFORMER && visual.target?.character === CHARACTER, 'Maryl visual review target drifted');
  ensure(visual.selected_still?.download_sha256 === STILL_SHA256, 'selected Maryl still hash drifted');
  ensure(visual.selected_still?.descriptionurl === STILL_ORIGIN, 'selected Maryl still origin drifted');
  ensure(visual.rejected_cross_performer_file?.download_sha256 === REJECTED_SHA256, 'rejected Erica Mer image hash drifted');
  ensure(visual.rejected_cross_performer_file?.descriptionurl === REJECTED_ORIGIN, 'rejected Erica Mer image origin drifted');
  ensure(visual.basis?.cross_performer_substitution === false && visual.basis?.generic_seven_still_used === false, 'Maryl visual boundary drifted');

  const sourceRevision = readJson(findOne(mediaRoot, 'source-revision.json'));
  const page = sourceRevision.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const content = revision?.slots?.main?.content;
  ensure(page?.pageid === SOURCE_PAGEID && revision?.revid === SOURCE_REVISION && revision?.timestamp === SOURCE_TIMESTAMP, 'Maryl pinned source revision drifted');
  ensure(sha(Buffer.from(content, 'utf8')) === SOURCE_CONTENT_SHA256, 'Maryl pinned source content hash drifted');
  for (const literal of [
    '|image         = Maryl.jpg',
    '|caption       = Maryl',
    '|image2        = Seven as a frightened child.jpg',
    '|caption2      = Seven as Maryl',
    '|actor         = [[Erica Mer]] (girl in reflection)<br>[[Jeri Ryan]]',
    'Seven once again reverted to a frightened Maryl',
  ]) ensure(content.includes(literal), `Maryl source lost literal: ${literal}`);

  const still = findOne(mediaRoot, 'selected-jeri-ryan-maryl.jpg');
  ensure(shaFile(still) === STILL_SHA256, 'Maryl retained still bytes drifted');
  return { visual, sourceRevision, still };
}

function buildDraft() {
  return {
    character: CHARACTER,
    actor: PERFORMER,
    production: PRODUCTION,
    universe: 'Star Trek',
    years: YEARS,
    designer: '—',
    transform: 2,
    knownFor: KNOWN_FOR,
    reveal: REVEAL,
    references: [
      {
        claim: 'performance',
        label: 'The Maryl source separately credits Jeri Ryan and identifies Seven of Nine assuming Maryl’s personality in Infinite Regress',
        publisher: 'Memory Alpha',
        source: SOURCE,
      },
      {
        claim: 'production',
        label: 'Infinite Regress is the Star Trek: Voyager episode in which Seven manifests Maryl',
        publisher: 'Memory Alpha',
        source: EPISODE_SOURCE,
      },
    ],
    wiki: 'https://en.wikipedia.org/wiki/Jeri_Ryan',
  };
}

function patchCardAndLedger(wallId, stillSource) {
  const cards = readJson('data/specimens.json');
  const card = cards.find((row) => row.id === wallId);
  ensure(card, `card ${wallId} missing after grow`);
  ensure(normalize(card.actor) === normalize(PERFORMER) && normalize(card.character) === normalize(CHARACTER), 'grown Maryl card identity drifted');
  card.production = PRODUCTION;
  card.universe = 'Star Trek';
  card.years = YEARS;
  card.designer = '—';
  card.transform = 2;
  delete card.kind;
  card.knownFor = KNOWN_FOR;
  card.reveal = REVEAL;
  card.references = buildDraft().references;
  card.link = SOURCE;

  const stillPath = `images/${wallId.toLowerCase()}-still.jpg`;
  fs.copyFileSync(stillSource, stillPath);
  ensure(shaFile(stillPath) === STILL_SHA256, 'copied Maryl still hash drifted');
  card.still = {
    src: stillPath,
    kind: 'still',
    origin: STILL_ORIGIN,
    focus: { x: 'center', y: 'center' },
    pin: true,
