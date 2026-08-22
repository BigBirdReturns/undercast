  };
  writeJson('data/specimens.json', cards);

  node('scripts/pin.mjs', [wallId, '--wiki', 'https://commons.wikimedia.org/w/api.php', '--portrait', PORTRAIT_FILE], {
    extraEnv: { CONTACT: 'chatgpt-maryl-cycle' },
  });

  const nextCards = readJson('data/specimens.json');
  const nextCard = nextCards.find((row) => row.id === wallId);
  ensure(nextCard?.portrait?.origin === PORTRAIT_ORIGIN, `Maryl portrait origin drifted: ${nextCard?.portrait?.origin}`);
  ensure(/CC BY 2\.0/i.test(nextCard.portrait.license || ''), `Maryl portrait license drifted: ${nextCard.portrait.license}`);
  ensure(/Brian Wilkins/i.test(nextCard.portrait.author || ''), `Maryl portrait author drifted: ${nextCard.portrait.author}`);
  nextCard.portrait.year = 2010;
  nextCard.portrait.focus = { x: 'center', y: 'upper' };
  nextCard.portrait.pin = true;
  writeJson('data/specimens.json', nextCards);

  const portraitPath = nextCard.portrait.src;
  const portraitSha = shaFile(portraitPath);
  const existingPortraits = ['images/uc-037-portrait.jpg', 'images/uc-1392-portrait.jpg'];
  for (const file of existingPortraits) {
    ensure(fs.existsSync(file), `required prior portrait missing: ${file}`);
    ensure(shaFile(file) !== portraitSha, `Maryl portrait duplicates ${file}`);
  }
  for (const file of fs.readdirSync('images').map((name) => path.join('images', name))) {
    if (!fs.statSync(file).isFile() || file === portraitPath) continue;
    ensure(shaFile(file) !== portraitSha, `Maryl portrait duplicates existing asset ${file}`);
  }

  let ledger = readJson('data/SOURCES.json');
  let source = ledger.find((row) => row.id === wallId);
  if (!source) {
    source = { id: wallId, actor: PERFORMER, character: CHARACTER, universe: 'Star Trek', still: null, portrait: null };
    ledger.push(source);
  }
  source.actor = PERFORMER;
  source.character = CHARACTER;
  source.universe = 'Star Trek';
  source.still = nextCard.still;
  source.portrait = nextCard.portrait;
  source.fetched_at = new Date().toISOString().slice(0, 10);
  ledger.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeJson('data/SOURCES.json', ledger);
  return { card: nextCard, portraitPath, portraitSha };
}

function buildMediaResolution(wallId, reviewedAt) {
  const audit = readJson('data/MEDIA-AUDIT.json');
  const items = audit.items.filter((row) => row.wall_id === wallId).sort((a, b) => a.side.localeCompare(b.side));
  ensure(items.length === 2, `expected two Maryl media facets, found ${items.length}`);
  const still = items.find((row) => row.side === 'still');
  const portrait = items.find((row) => row.side === 'portrait');
  ensure(still?.asset?.sha256 === STILL_SHA256, 'Maryl media-audit still hash drifted');
  ensure(portrait?.asset?.sha256 && portrait.asset.sha256 !== STILL_SHA256, 'Maryl media-audit portrait hash missing or colliding');
  const common = { enforced: true, at: reviewedAt };
  return {
    version: 2,
    reviewed_by: 'chatgpt-maryl-second-desk',
    reviewed_role: 'second-desk',
    reviewed_at: reviewedAt,
    votes: [
      {
        item_id: still.id,
        namespace: 'identity',
        value: 'expected',
        note: 'The pinned source caption identifies this exact frame as Seven as Maryl in Infinite Regress.',
        evidence: [`source-page:${SOURCE}`, `source-revision:${SOURCE_REVISION}`, `source-file:${STILL_ORIGIN}`, `asset-sha256:${STILL_SHA256}`],
        ...common,
      },
      {
        item_id: still.id,
        namespace: 'presentation',
        value: 'character-depiction',
        note: 'The frame depicts adult Seven of Nine physically performing Maryl’s frightened-child personality, not Erica Mer’s reflected child.',
        evidence: [`source-caption:Seven as Maryl`, `rejected-cross-performer:${REJECTED_ORIGIN}`, `rejected-sha256:${REJECTED_SHA256}`, `asset-sha256:${STILL_SHA256}`],
        ...common,
      },
      {
        item_id: portrait.id,
        namespace: 'identity',
        value: 'expected',
        note: 'The licensed Commons file identifies Jeri Ryan and is separate from character and maker evidence.',
        evidence: [`source-file:${PORTRAIT_ORIGIN}`, `source-author:Brian Wilkins`, `source-license:CC BY 2.0`, `asset-sha256:${portrait.asset.sha256}`],
        ...common,
      },
      {
        item_id: portrait.id,
        namespace: 'presentation',
        value: 'neutral-human',
        note: 'The portrait presents Jeri Ryan as a neutral human performer and is byte-distinct from prior canonical Jeri Ryan portraits.',
        evidence: [`source-file:${PORTRAIT_ORIGIN}`, `distinct-from:UC-037`, `distinct-from:UC-1392`, `asset-sha256:${portrait.asset.sha256}`],
        ...common,
      },
    ],
  };
}

function stage() {
  const mediaRoot = env.MEDIA_ROOT;
  const stageRoot = env.STAGE_ROOT;
