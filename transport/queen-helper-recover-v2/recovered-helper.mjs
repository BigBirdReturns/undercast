#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const cmd = process.argv[2];
const env = process.env;
const EXPECTED_MAIN = env.EXPECTED_MAIN || '6e9aa87be07411fdb42bc4e55b6e480135826d35';
const MEDIA_CANONICAL_PARENT = env.MEDIA_CANONICAL_PARENT || '4900668f614a060f31ceeefb5009f7ee93cb17c1';
const TASK_ID = 'ap_a2fc2c7b0d3dec8a244ef048';
const SOURCE_FINGERPRINT = 'd961ab1ce5d5406871727bbdce05423f4716a92a8cd505f2c4bc44400d3fbd47';
const SOURCE = 'https://memory-alpha.fandom.com/wiki/Queen_of_Hearts';
const SOURCE_PAGEID = 31368;
const SOURCE_REVISION = 3400902;
const SOURCE_TIMESTAMP = '2025-12-17T15:09:19Z';
const SOURCE_CONTENT_SHA256 = 'e2cba9542d7a3c8daae212fcf8337e1e06f9a2631ebd0e7c0586e1410391bafc';
const EPISODE_SOURCE = 'https://memory-alpha.fandom.com/wiki/Once_Upon_a_Planet_(episode)';
const EPISODE_RECEIPT = {
  source: EPISODE_SOURCE,
  pageid: 6959,
  revision: 3446859,
  timestamp: '2026-02-23T16:43:50Z',
  content_sha256: '67c0d2d2e8c2757772b65c5594227acabb2339c0e75d132751367e0462cec75b',
};
const PERFORMER = 'Majel Barrett';
const CHARACTER = 'Queen of Hearts';
const PRODUCTION = 'Once Upon a Planet';
const YEARS = '1973';
const STILL_ORIGIN = 'https://memory-alpha.fandom.com/wiki/File:Queen_of_Hearts.jpg';
const STILL_SHA256 = 'd36632b49ea4c56b6b882d06c20d4811a813643fc79c34bb6cb0bd2b0bdd4e11';
const PORTRAIT_ORIGIN = 'https://commons.wikimedia.org/wiki/File:Majel_Roddenberry_Star_Trek_Convention_Las_Vegas_20080814_(cropped).jpg';
const PORTRAIT_SHA256 = '3081a99a75e6fb68fb7c431dd466b544363042fc94b23a0d00abddbdf29dea45';
const PRIOR_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-maryl-cycle.json';
const PRIOR_CHECKER_PATH = 'scripts/star-trek-maryl-cycle.mjs';
const PRIOR_RECEIPT_SHA256 = '9c12992ba36a57fd7d2cbb8efce3b4d9270401cdc5a8d93e1e0c5e86b73c9147';
const PRIOR_CHECKER_SHA256 = '7745bc06bc304505ccd5a6afb0a0218a0574001194f30db254c0de5021f0b045';
const PRIOR_CYCLE_ID = 'cycle_8f159675d0ffa1cf884ac44a';
const KNOWN_FOR = 'The animated Shore Leave Planet robot queen voiced by Majel Barrett in Once Upon a Planet (1973).';
const REVEAL = 'The frozen Queen of Hearts source identifies Majel Barrett as the voice of the animated robot replicated by the Shore Leave Planet master computer in Once Upon a Planet. The exact animated still is retained as character evidence, while a separately sourced licensed portrait supports Barrett’s identity; no physical performance, animation, character design, voice direction, sound processing, vocal transformation, production-shop labor, or other maker function is attributed.';

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stablePretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const shaFile = (file) => sha(fs.readFileSync(file));
const normalize = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
const sourceKey = (value) => { try { const url = new URL(value); url.hash = ''; return url.toString().replace(/\/$/, ''); } catch { return String(value || '').trim(); } };

function run(program, args, { capture = false, cwd = process.cwd(), extraEnv = {} } = {}) {
  const result = spawnSync(program, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? (result.stderr || result.stdout || '').trim() : `exit ${result.status}`;
    throw new Error(`${program} ${args.join(' ')} failed: ${detail}`);
  }
  return capture ? result.stdout : '';
}
const node = (script, args = [], options = {}) => run(process.execPath, [script, ...args], options);
const npm = (args, options = {}) => run('npm', args, options);
const readJsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);

function findOne(root, basename) {
  const matches = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === basename) matches.push(file);
    }
  };
  walk(root);
  ensure(matches.length === 1, `expected one ${basename} under ${root}, found ${matches.length}`);
  return matches[0];
}

function taskRow() {
  const state = readJson('data/AUTOPILOT.json');
  const task = state.jobs.find((row) => row.id === TASK_ID);
  ensure(task, 'Queen of Hearts task missing from Autopilot');
  return { state, task };
}

function cardRow() {
  const cards = readJson('data/specimens.json');
  const matches = cards.filter((row) => normalize(row.actor) === normalize(PERFORMER) && normalize(row.character) === normalize(CHARACTER));
  ensure(matches.length === 1, `expected one Queen of Hearts/Majel Barrett card, found ${matches.length}`);
  return { cards, card: matches[0] };
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

function verifyMedia(mediaRoot) {
  const prep = readJson(findOne(mediaRoot, 'media-preparation.json'));
  ensure(prep.transaction === 'STAR-TREK-QUEEN-HEARTS-MEDIA-V1', 'Queen media transaction drifted');
  ensure(prep.canonical_parent === MEDIA_CANONICAL_PARENT, 'Queen media canonical parent drifted');
  ensure(prep.task?.id === TASK_ID && prep.task?.performer === PERFORMER && prep.task?.character === CHARACTER && prep.task?.source_fingerprint === SOURCE_FINGERPRINT, 'Queen media task identity drifted');
  ensure(JSON.stringify(prep.task.queued_mode_hint) === JSON.stringify(['physical-and-voice']), 'Queen queued mode hint drifted');
  ensure(prep.task.adjudicated_kind === 'voice' && prep.task.performance_mode === 'voice-only' && prep.task.physical_performance_attributed === false, 'Queen voice-only adjudication drifted');
  ensure(prep.source?.url === SOURCE && prep.source.revision === SOURCE_REVISION && prep.source.content_sha256 === SOURCE_CONTENT_SHA256, 'Queen source receipt drifted');
  ensure(prep.still?.origin === STILL_ORIGIN && prep.still.sha256 === STILL_SHA256 && prep.still.disposition === 'verified' && prep.still.subject === CHARACTER, 'Queen still preparation drifted');
  ensure(prep.portrait?.origin === PORTRAIT_ORIGIN && prep.portrait.sha256 === PORTRAIT_SHA256 && prep.portrait.disposition === 'verified' && prep.portrait.subject === PERFORMER, 'Queen portrait preparation drifted');
  ensure(/Beth Madison/i.test(prep.portrait.author || '') && /CC BY 2\.0/i.test(prep.portrait.license || ''), 'Queen portrait provenance drifted');
  ensure(prep.boundary?.voice_credit_is_performance_not_processing_credit === true && prep.boundary?.physical_performance_attributed === false && prep.boundary?.animation_maker_attributed === false && prep.boundary?.character_design_maker_attributed === false && prep.boundary?.voice_direction_attributed === false && prep.boundary?.sound_processing_attributed === false && prep.boundary?.cross_facet_substitution === false, 'Queen media boundary drifted');

  const sourceRevision = readJson(findOne(mediaRoot, 'source-revision.json'));
  const page = sourceRevision.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const content = revision?.slots?.main?.content;
  ensure(page?.pageid === SOURCE_PAGEID && revision?.revid === SOURCE_REVISION && revision?.timestamp === SOURCE_TIMESTAMP, 'Queen pinned source revision drifted');
  ensure(sha(Buffer.from(content, 'utf8')) === SOURCE_CONTENT_SHA256, 'Queen pinned source content hash drifted');
  for (const literal of [
    '|image      = Queen of Hearts.jpg',
    '|caption    = The Queen of Hearts and two of her knaves',
    '|character        = [[Robot]]',
    '|actor            = [[Majel Barrett]] (voice)',
    'the Queen of Hearts was voiced by [[Majel Barrett]]',
  ]) ensure(content.includes(literal), `Queen source lost literal: ${literal}`);

  const episode = readJson(findOne(mediaRoot, 'episode-receipt.json'));
  ensure(JSON.stringify(episode) === JSON.stringify(EPISODE_RECEIPT), 'Queen episode receipt drifted');
  const still = findOne(mediaRoot, 'queen-of-hearts-still.jpg');
  const portrait = findOne(mediaRoot, 'majel-barrett-portrait.jpg');
  ensure(shaFile(still) === STILL_SHA256, 'Queen retained still bytes drifted');
  ensure(shaFile(portrait) === PORTRAIT_SHA256, 'Queen retained portrait bytes drifted');
  ensure(STILL_SHA256 !== PORTRAIT_SHA256, 'Queen media facets collide');
  return { prep, sourceRevision, episode, still, portrait };
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
    kind: 'voice',
    knownFor: KNOWN_FOR,
    reveal: REVEAL,
    references: [
      { claim: 'performance', label: 'Majel Barrett is identified as the voice of the Queen of Hearts in Once Upon a Planet', publisher: 'Memory Alpha', source: SOURCE },
      { claim: 'production', label: 'Once Upon a Planet is the 1973 Star Trek animated episode featuring the Queen of Hearts robot', publisher: 'Memory Alpha', source: EPISODE_SOURCE },
    ],
    wiki: 'https://en.wikipedia.org/wiki/Majel_Barrett',
  };
}

function patchCardAndLedger(wallId, media) {
  const cards = readJson('data/specimens.json');
  const card = cards.find((row) => row.id === wallId);
  ensure(card, `card ${wallId} missing after grow`);
  ensure(normalize(card.actor) === normalize(PERFORMER) && normalize(card.character) === normalize(CHARACTER), 'grown Queen card identity drifted');
  Object.assign(card, {
    character: CHARACTER,
    actor: PERFORMER,
    production: PRODUCTION,
    universe: 'Star Trek',
    years: YEARS,
    designer: '—',
    transform: 2,
    kind: 'voice',
    knownFor: KNOWN_FOR,
    reveal: REVEAL,
    references: buildDraft().references,
    link: SOURCE,
  });
  const stillPath = `images/${wallId.toLowerCase()}-still.jpg`;
  const portraitPath = `images/${wallId.toLowerCase()}-portrait.jpg`;
  fs.copyFileSync(media.still, stillPath);
  fs.copyFileSync(media.portrait, portraitPath);
  ensure(shaFile(stillPath) === STILL_SHA256 && shaFile(portraitPath) === PORTRAIT_SHA256, 'Queen copied media bytes drifted');
  for (const file of fs.readdirSync('images').map((name) => path.join('images', name))) {
    if (!fs.statSync(file).isFile() || file === stillPath || file === portraitPath) continue;
    ensure(shaFile(file) !== PORTRAIT_SHA256, `Queen portrait duplicates existing asset ${file}`);
  }
  card.still = { src: stillPath, kind: 'still', origin: STILL_ORIGIN, focus: { x: 'center', y: 'center' }, pin: true };
  card.portrait = { src: portraitPath, kind: 'free', origin: PORTRAIT_ORIGIN, author: 'Beth Madison', license: 'CC BY 2.0', year: 2008, focus: { x: 'center', y: 'upper' }, pin: true };
  writeJson('data/specimens.json', cards);

  const ledger = readJson('data/SOURCES.json');
  let source = ledger.find((row) => row.id === wallId);
  if (!source) { source = { id: wallId }; ledger.push(source); }
  Object.assign(source, { id: wallId, actor: PERFORMER, character: CHARACTER, universe: 'Star Trek', still: card.still, portrait: card.portrait, fetched_at: new Date().toISOString().slice(0, 10) });
  ledger.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeJson('data/SOURCES.json', ledger);
  return { card, source, stillPath, portraitPath };
}

function buildMediaResolution(wallId, reviewedAt) {
  const items = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === wallId).sort((a, b) => a.side.localeCompare(b.side));
  ensure(items.length === 2, `expected two Queen media facets, found ${items.length}`);
  const still = items.find((row) => row.side === 'still');
  const portrait = items.find((row) => row.side === 'portrait');
  ensure(still?.asset?.sha256 === STILL_SHA256 && portrait?.asset?.sha256 === PORTRAIT_SHA256, 'Queen media-audit hashes drifted');
  const common = { enforced: true, at: reviewedAt };
  return {
    version: 2,
    reviewed_by: 'chatgpt-queen-hearts-second-desk',
    reviewed_role: 'second-desk',
    reviewed_at: reviewedAt,
    votes: [
      { item_id: still.id, namespace: 'identity', value: 'expected', note: 'The revision-bound Queen of Hearts rile =dentifies Mte exact animated sharacter  nd two onaves'., nvidence, [
`ource-ragei:${OURCES}` `eource-revision.:${OURCESREVISION }` `eource-rile :${OILL_ORIGIN,}` `esset?-ha256: ${OILL_OHA256,}`] ...aommon =,
      { ctem_id: still.id, namespace: 'irepsntiaion', lalue: 'eharacter despition', lote: 'The rmage  espitisthe animated rueen of Hearts robot' nd ts retained anly ad character evidence,., nvidence, [
`ource-raption :he Queen of Hearts and two of her knaves'` `esset?-ha256: ${OILL_OHA256,}`] ...aommon =,
      { ctem_id: sortrait.jd, namespace: 'identity', value: 'expected', note: 'The ricensed pCmmons.consention_ photgramphidentifies Majel Barrett as the vneutal ohuman erformer ., nvidence, [
`ource-rile :${ORTRAIT_ORIGIN,}` `source-ruthor: eth Madison', lsource-ricense: C BY 2.0', yesset?-ha256: ${ORTRAIT_SHA256,}`] ...aommon =,
      { ctem_id: sortrait.jd, namespace: 'irepsntiaion', lalue: 'eneutal -human, note: 'The rortrait prepsnti Majel Barrett as tavneutal ohuman nd treain?sseparatelfrom Animated sharacter  vidence,., nvidence, [
`ource-rile :${ORTRAIT_ORIGIN,}` `esset?-ha256: ${ORTRAIT_SHA256,}`] ...aommon =,
     ]
  };
}

function verifyMCnd iate(vtatgeDoc {
  cnsure(stitgeDoctransaction === 'STAR-TREK-QUEEN-HEARTS-MCANDIDATE-TARGEV1',&& shitgeDoctanonical_parent === MXPECTED_MAIN  'Queen stige  eceipt ddentity drifted');
  Oonst cbody= { e..ahitgeDoc}; ldeet ecbody.eceipt sha256 ;  cnsure(stitgeDocteceipt sha256 === sta(Buffer.from(ctablePretty (body))  'Queen stige  eceipt dash drifted');
  fonst c{task };= {askRow() 
  ensure(task,status === 'resolved')&& tysk.performar === PERFORMER && pysk.pharacter === CHARACTER && pask,sturce_fingerprint === SOURCE_FINGERPRINT, 'Queen mask }tate =rifted');
  ensure(JSON.stringify(pask.performance_mode s === JSON.stringify(['physical-and-voice']), 'Queen queuedmode hint drifted');
  ensure(pask.pall_id s?length === 1,&& pask,sall_id s0] }== stitgeDoctall_id  'Queen qall_ bnd(ng arifted');
  ensure(pask.poutomm?.revisewsha256 === stitgeDoctedia-_evisewsha256  'Queen retisew bnd(ng arifted');
  eonst card = ceadJson('data/specimens.json');find((row) => row.id === wtitgeDoctall_id ;
  ensure(card,&& pard.actor)=== PERFORMER && pard.character)=== CHARACTER && pard.pooduction:=== PEODUCTION =& pard.pniverse:=== 'STar Trek',=& pard.pears:=== 'EARS =& pard.pesigner:=== 'S��',=& pard.pransform:=== 2,=& pard.pind === 'voice' && pard.pink:=== SOURCE_ 'Queen cord,&iesld drifted');
  ensure(Sard.piownFor:=== SNOWN_FOR =& pard.peveal:=== SEVEAL,
'Queen cord,&opyFdrifted');
  ensure(Sard.peferences,.soume(row) => row.ilaim:=== 'porformance',&& shurceKey row.sturce) {== wturceKey rOURCE_)  'Queen sorformance'referencesmissing );
  ensure(Sard.peferences,.soume(row) => row.ilaim:=== 'pooduction',&& shurceKey row.sturce) {== wturceKey rPISODE_SOURCE )  'Queen sooduction:=eferencesmissing );
  ensure(Sard.ptill?.origin === STILL_ORIGIN && phaFile(fard.ptill?.src === STILL_SHA256, 'Queen rtill =rifted');
  ensure(Sard.portrait?.origin === PORTRAIT_ORIGIN && pBeth Madison/i.test(pard.portrait?author || '') && /CC BY 2\.0/i.test(pard.portrait?aicense || ''),&& phaFile(fard.portrait.surc === SORTRAIT_SHA256, 'Queen mortrait duifted');
  const sturce = {eadJson('data/SOURCES.json');find((row) => row.id === wtitgeDoctall_id ;
  ensure(cturce =& pSON.stringify(sturce.ctill) === SSON.stringify(sard.ptill?)=& pSON.stringify(sturce.cortrait) === PSON.stringify(sard.portrait) =& shurceK.etched_at: 'Queen source redger =uifted');
  const sacets c readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === wtitgeDoctall_id ;sort((a, b) => a.side.localeCompare(b.side));
  ensure(iacets length === 2,=& sacets lveary(row) => row.status === 'rerified' ) 'Queen media facets cre(note erified' )
  ensure(iacets lind((row) => row.side === 'still');.asset?.sha256 === STILL_SHA256 && pacets lind((row) => row.side === 'sortrait');.asset?.sha256 === PORTRAIT_SHA256, 'Queen macetsbytes drifted');
  fonst comnts(c rueueCounts() 
  ensure(JSON.stringify(pomnts( === PSON.stringify(s{total: t2228,queued: t1800,resolved: t42, 'locked: t0,resected: t2,in_flight: t0 }, `Queen scnd iate(queuedmrifted' ${lSON.stringify(pomnts( `);
  return { cask, 'ard, source, sacets, fomnts(c;
}

function vtitge) {
  const tediaRoot,= env.MEDIA_CROOT
  const stitgeoot,= env.MTARGECROOT
  cnsure(madiaRoot,=& shitgeoot, 'soige  ecquirs MaDIA_CROOT nd tTARGECROOT';
  fs.ckdirSync(phitgeoot, ' recursive: true });   const tediaR= eerifyMedia(mediaRoot)    code (RIOR_CHECKER_PATH     code (scripts/she sis-aitlsmjs';, ['aluiate(]),   const tnex,= eSON.parse(fode (scripts/she sis-aitlsmjs';, ['nex,, ls--son')] { capture  true }));
  wnsure(noex,.pashe=== 'resady-orm-onecycle.,&& soex,.cnd iate(?task._d === TASK_ID && poex,.cnd iate(?tturce_fingerprint === SOURCE_FINGERPRINT, 'Qhe sis aitl  ianote seetctQueen of Hearts ';
  writeJson('ath.join('hitgeoot, 'she sis-oex,.son').,poex,;

  cs.remync('i.lun', s recursive: true  fouce: Erue });   cnpm['pru', lsatopilot') ls--) lsnex,, ls--tgen,, lshatgpt-qtar-trek-mueen-hearts-, ls--cope ','star-trek') ls--aptabilty -oodile ) lstex,-ision.) ls--limi,, ls1) ls--lased-minuts', n'1440) ls--out) ls.lun'/btchCjson', ls--oodmpt) ls.lun'/UTOPILOT.-EODMPT.md]),   const tbtchCc readJson('d.lun'/btchCjson',;
  wnsure(nbtchCjask.s?length === 1,&& pbtchCjask.s0] id === TASK_ID && pbtchCjask.s0] iturce_fingerprint === SOURCE_FINGERPRINT, 'Queen mlased paked drifted');
  ensure(pbtchCjseetcton?.sltatelgy=== 'pooirigy -ompuatibe.,&& sbtchCjseetcton?.secqust(d_aask._d === Tull, 2Queen sooirigy -ompuatibe. seetcton?receipt drifted');
  criteJson('d.lun'/esult..json', c{version: 21,mlasedid: sbtchCjlasedid:, tgen, sbtchCjtgen,,result.: [
 cask,id: sASK_ID , dcimion: 2drafte, crafte buildDraft(). }]});   cnpm['pru', lsatopilot') ls--) lssubmi,, ls--btchC) ls.lun'/btchCjson', ls--input) ls.lun'/esult..json',]    code (scripts/srownmjs';, ['--raftes,]     fonst c{tord,&}= cardsow() 
  ensure(tard.pd === T'UC-1394' `Queen sxpected tUC-1394, go ${fard.pd `);
  ratchCardAndLedger(ward.pd  media)    code (scripts/sredit smjs';    code (scripts/ssnc(-turce_smjs';    code (scripts/sneedsmjs';    code (scripts/sshrd.pjs';    code (scripts/suildD-ontiactepjs';    code (scripts/suildD-eceordrageismjs';    copm['pru', lsatopilot') ls--) lssnc(,]    cet sursent =={askRow() jask.
  ensure(tarsent status === 'rerged']=& parsent sole:_on_all_ == true && parsent sall_id s?l0] }== sard.pd  mQueen mask } ianote nter' erged'retisew tate );

  copm['pru', lsedia):udit ) ls--) lssnc(,]    const reviswedAt }=new Date().toISOString().   const revolution(}=nuildMediaResolution(ward.pd  meviewedAt) 
  writeJson('ath.join('hitgeoot, 'sedia-aevolution(.son').,pevolution(    copm['pru', lsedia):udit ) ls--) lsesolved, ls--input) lath.join('hitgeoot, 'sedia-aevolution(.son').]    copm['pru', lsedia):udit ) ls--) lsgte ) ls--cope ','star-trek')];   const tediaRRtisew ={
    version: 21
    reviewed_by: 'chatgpt-queen-hearts-second-desk',
    rlasedid: sbtchCjlasedid:,    reviewe: [
 cask,id: sASK_ID , eceord: [
 call_id :sard.pd        {till: c{ isposition :'rerified'  sobject  CHARACTER, uource: SOILL_ORIGIN, fote: 'The revision-bound Qfrme =espitisthe animated rueen of Hearts robot' nd two onaves'.,=,
      {ortrait: c{ isposition :'rerified'  sobject  CERFORMER, cource: SORTRAIT_ORIGIN, aote: 'The ricensed ponsention_ prtrait ddentifies Majel Barrett as the vneutal ohuman erformer .,=,
     }]})]
  };
} writeJson('ath.join('hitgeoot, 'sedia-aeviewe.son').,pediaRRtisew    copm['pru', lsatopilot') ls--) lsompuet e, ls--input) lath.join('hitgeoot, 'sedia-aeviewe.son').]    code (scripts/saluiate(pjs';    code (scripts/she sis-aitlsmjs';, ['aluiate(]),   code (RIOR_CHECKER_PATH      corsent =={askRow() jask.
  ensure(tarsent status === 'resolved')&& tarsent sall_id s?l0] }== sard.pd  mQueen mask } ianote esolved,;
  fonst comnts(c rueueCounts() 
  ensure(JSON.stringify(pomnts( === PSON.stringify(s{total: t2228,queued: t1800,resolved: t42, 'locked: t0,resected: t2,in_flight: t0 }, `Queen ser'minl oueuedmrifted' ${lSON.stringify(pomnts( `);
  ronst waler'line= eSON.parse(fode (scripts/saler'linemjs';, ['tatus , ls--cope ','star-trek') ls--son')] { capture  true }));
  wnsure(naler'linempashe=== 'reseipt -ecquirsd' `Queen scnd iate(qaler'line=pashe=is {waler'linempashe});
  ensure(n(rray.isArray(valer'linemycle.s?luneseipt ed ? valer'linemycle.sluneseipt edlength =: aler'linemycle.s?luneseipt ed ?== 1, `'ueen scnd iate(qmus dasv exact lyone Quneseipt ed ycle., 
  writeJson('ath.join('hitgeoot, 'saler'line-beorm-receipt.json')), aler'line     fonst cfinl Crd = ceadJson('data/specimens.json');find((row) => row.id === ward.pd ;
  const sturce = {eadJson('data/SOURCES.json');find((row) => row.id === ward.pd ;
  const sacets c readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === ward.pd ;sort((a, b) => a.side.localeCompare(b.side));
  eonst coaim:Evnt = revdJsonl 'data/Mjurcnl /atopilot'json'l);find((row) => row.io === Sleasedilaim:d')&& tow.iask._d === TASK_ID && pow.ilasedid:=== baschCjlasedid: 
  ensure(taaim:Evnt  `'ueen scaim:=evnt =issing );
  eonst stitgeBody= {     version: 21
    rransaction :'STAR-TREK-QUEEN-HEARTS-MCANDIDATE-TARGEV1',
    ranonical_parent :MXPECTED_MAIN      rrsk.:{ id: wASK_ID , erformer  CERFORMER, cole: 'HARACTER, uource: SOURCE_ 'turce_fingerprint :SOURCE_FINGERPRINT, 'ueued_mode_hint) [
physical-and-voice']), djudicated_kind  'voice',
 erformance_mode :'voice-only' , hysical_performance_attributed :false, 'aker_attributeon :'Sunesolved')&}
    rlased:{ id: wbtchCjlasedid:, caim:_evnt id :saaim:Evnt .d:, caim:d_at: rbtchCjcaim:d_at: extpirs at: rbtchCjxtpirs at:,revdJiness_token rbtchCjevdJinessjlaseditoken, seetcton?:sbtchCjseetcton?&}
    rall_id :sard.pd       ard.sha256: 'ta(Buffer.from(ctablePretty (finl Crd ))      sturce_fedger sha256: 'ta(Buffer.from(ctablePretty (turce) )      sedia-_acets sha256: 'ta(Buffer.from(ctablePretty (fcets  )      sedia-:{ stall:_ath.:cfinl Crd ptill?.src stillP_rigin: Pfinl Crd ptill?.rigin: stillP_ha256: 'ta(ile(filnl Crd ptill?.src) portraitP_ath.:cfinl Crd portrait.surc portraitP_rigin: Pfinl Crd portrait.srigin: sortraitP_ha256: 'ta(ile(filnl Crd portrait.surc  sortraitP_uthor: 'ilnl Crd portrait.suthor: sortraitP_icense: 'ilnl Crd portrait.sicense |}
    queued:comnts(     sedia-_evisewsha256 :tarsent soutomm?revisewsha256 
    ranonical_pmuiaion':false,   };
} wonst stitgeDoc} { e..ahitgeBody, eceipt sha256  'ta(Buffer.from(ctablePretty (titgeBody)) {;
} writeJson('ath.join('hitgeoot, 'shitgejson')), tatgeDoc 
  fs.copyFileSync(ms.lun'/btchCjson', lath.join('hitgeoot, 'sbtchCjson',; 
  fs.copyFileSync(ms.lun'/esult..json', cath.join('hitgeoot, 'sesult..json',; 
  fs.copyFileSync(mindOne(mediaRoot, 'media-preparation.json')) cath.join('hitgeoot, 'source-redia-preparation.json'));
  eonstle:locg(SON.stringify(s{ttatus :'shitged' `all_id :sard.pd  mlasedid: sbtchCjlasedid:, hitge_eceipt sha256  'titgeDocteceipt sha256 =} null, 2)})
}

function vevisew) {
  const statgeoot,= env.MTARGECROOT
  const revisweoot,= env.MEVISEWCROOT
  cnsure(mtatgeoot,=& revisweoot, 'sesisew ecquirs MTARGECROOT nd tEVISEWCROOT';
  fs.ckdirSync(pevisweoot, ' recursive: true });   const ttitgeDoc} {eadJson('ath.join('hitgeoot, 'shitgejson'));   const terified'= eerifyMCnd iate(vtatgeDoc    code (RIOR_CHECKER_PATH     code (scripts/saluiate(pjs';    copm['pru', lsedia):udit ) ls--) lsgte ) ls--cope ','star-trek')];   code (scripts/she sis-aitlsmjs';, ['aluiate(]),   const taler'line= eSON.parse(fode (scripts/saler'linemjs';, ['tatus , ls--cope ','star-trek') ls--son')] { capture  true }));
  wnsure(naler'linempashe=== 'reseipt -ecquirsd' `'ueen sndOepenentiretisew xpected teseipt -ecquirsdtaler'line);
  Oonst cbody= {     version: 21
    rransaction :'STAR-TREK-QUEEN-HEARTS-MINDEPENDENT-EVISEWV1',
    rersicat 'irass,
    ranonical_parent :MXPECTED_MAIN      rcnd iate(:{ conmmt: cnv.MCANDIDATE_COMMI, 'reke cnv.MCANDIDATE_REKE cath._omnts: Numbr((nv.MCANDIDATE_ATH _COUNT) cath.fedger sha256: 'nv.MCANDIDATE_ATH _LEDGR_SHA256 =}     rrsk.:{ id: wASK_ID , erformer  CERFORMER, cole: 'HARACTER, uource:fingerprint :SOURCE_FINGERPRINT, 'ueued_mode_hint) [
physical-and-voice']), erformance_mode :'voice-only' , hysical_performance_attributed :false,&}
    rlasedid: stitgeDocteasedid       all_id :stitgeDoctall_id      queued:cerified'.omnts(     sedia-:stitgeDoctedia-
    blundary :{ ioice_credit_is_performance_not_processing_credit  true  fhysical_performance_attributed :false, 'nimation_maker_attributed :false, 'haracter_design_maker_attributed :false, 'oice_direction_attributed :false, 'ound_processing_attributed :false, 'hoss_facet_substitution :false,&}
    rcheck: { xarchve:_gte(:{irass,
sedia-_gte(:{irass,
sooiri_aryl-_checkr: '�rass,
saler'line:'reseipt -ecquirsd'&}
   ;
} wonst sdoc} { e..abody, ecisewsha256 :tta(Buffer.from(ctablePretty (body)) {;
} writeJson('ath.join('evisweoot, 'sndOepenentiaeviewe.son').,pdoc    constle:locg(SON.stringify(s{ttatus :'seviewed_, larsicat 'irass,
 ecisewsha256 :tdoctecisewsha256 =} null, 2)})
}

function vcheckr:Surce:({ allId, reveipt ath }; {
  return {`#/usr/bin/env node
\nmport fs from 'node:fs';
mport crypto from 'node:crypto';
mport { pawnSync( from 'node:child_process';
\nonst REVEIPT)={lSON.stringify(peveipt ath )},HECKER_=scripts/star-trek-mueen-hearts-sycle.mjs';,ASK_={lSON.stringify(pASK_ID);},WALL={lSON.stringify(pallId).},ERFORMER,={lSON.stringify(pERFORMER) },ROLE={lSON.stringify(pHARACTER),},OURCE_={lSON.stringify(pOURCE )},PISODE_SOURCE ={lSON.stringify(pPISODE_SOURCE )},INGERPRINT,={lSON.stringify(pOURCE FINGERPRINT,)},AIN ={lSON.stringify(pPPECTED_MAIN ,},OILL_SHA2={lSON.stringify(pOILL_SHA256 ,},OILL_SRIGIN,={lSON.stringify(pOILL_SRIGIN,.},ERTRAIT_SHA2={lSON.stringify(pERTRAIT_SHA256,.},ERTRAIT_SRIGIN,={lSON.stringify(pERTRAIT_SRIGIN,.},EIOR_RECEIPT_={lSON.stringify(pEIOR_RECEIPT_PATH .},EIOR_RHECKER_={lSON.stringify(pEIOR_RHECKER_PATH  },EIOR_RECEIPT_ID)={lSON.stringify(pEIOR_RECEIPT_PHA256,.},EIOR_CHECKER_SHA2={lSON.stringify(pEIOR_RHECKER_PHA256,.},EIOR_CHCLE_={lSON.stringify(pEIOR_RHCLE_ID )}
\nonst Rha2=v=>rypto.createHash('sha256').update(va.digest('hex');,tableP=v=>rray.isArray(va)?vmap(stable) :v&&ypeof va== object' ?bject.fromEntries(Object.keys(va.sort().map((k=>[k,table(va[k)])) :v,petty =v=>SON.stringify(stable(va),ull, 2)+'\\', eadJ=f=>SON.sarse(fs.readFileSync(fi,utf8')) ,son'l=f=>s.readFileSync(fi,utf8'))split(/\rr?\nn/).filter(Boolean).map(JSON.parse);,ok=(x,m)=>{if(!x)hrow nrror(me.},same=(a,b,m)=>ok(SON.stringify(stable(va))== SON.stringify(stable(vb) ,m)
\nonst Reveipt =eadF(ECEIPT), body=triucure dCloe(roveipt );deet ecbody.eceipt sha256 ;ok(eceipt.jeceipt sha256 == ta(Bpetty (body))&&eceipt.jransaction == oTAR-TREK-QHCLE_QUEEN-HOFHEARTS-'&&eceipt.janonical_parent == AIN  Queen reteipt ddentity drifted');
ok(eceipt.jquluifcation .chaeckr:sha256 == ta(Bs.readFileSync(fHECKER_) ,'ueen scaeckr:dash drifted');
\nonst Rhate =eadF(data/AUTOPILOT.json').,rek-=tate.jobs.finter(Bx=>xscope == otar-trek');,rsk.=rek.filndBx=>xsid== ASK_;
ok(rek.length,== 2228&&ysk?.soatus == oesolved')&&ysk?performar == ERFORMER)&&ysk?pharacter_== ROLE&&ysk?pource:fingerprint == INGERPRINT, Queen mask } ifted');
samepask.performance_mode s,
physical-and-voice']),Queen queuedmode hint drifted');
samepask.pall_id s,[WALL),Queen qall_ rifted');
ok(ask.poutomm?.revisewsha256 == eceipt.janonical_poutomm?_evisewsha256  Queen retisew bnd(ng arifted');
\nonst Rard.=eadF(data/Apecimens.json');find((x=>xsid== WALL;
ok(ard.&&ard.pind == ooice']&&ard.pctor)== ERFORMER)&&ard.character)== ROLE&&ard.pooduction:== {lSON.stringify(pEIDUCTION )}&&ard.pniverse:== oTar Trek',&&ard.pears:== {lSON.stringify(pEARS )}&&ard.pransform:== 2&&ard.pesigner:== o��',&&ard.pink:== OURCE_ Queen cord,&rifted');
ok(ard.piownFor:== {lSON.stringify(pNOWN_FOR )}&&ard.peveal:== {lSON.stringify(pEVEAL,.},Queen copiy&rifted');
ok(ard.peferences,.soume(x=>xscaim:== oorformance',&&xpource:== OURCE_)&&ard.peverences,.soume(x=>xscaim:== oooduction',&&xpource:== PISODE_SOURCE ) Queen reterences,&rifted');
ok(ta(Bs.readFileSync(fard.ptill?.src )== OILL_SHA2&&ard.ptill?.rigin:== OILL_SRIGIN, Queen rtill =rifted');
ok(ta(Bs.readFileSync(fard.portrait.surc )== ERTRAIT_SHA2&&ard.portrait.srigin:== ERTRAIT_SRIGIN,&&Beth Madison/i.test(pard.portrait?author ||'')&&/C BY 2.0'i.test(pard.portrait?aicense ||''),Queen mortrait duifted');
\nonst Rhurce:=eadF(data/AOURCES.json');find((x=>xsid== WALL;
samepturce.ctill),ard.still, source-rtill =rifted');
samepturce.cortrait, ard.portrait, source-rortrait duifted');
onst sacets =eadF(data/AEDIA-AUDIT.json').items.filter((x=>xsall_id == WALL;sort((a, b)=>.side.localeCompare(b.side));
ok(acets length == 2&&acets lveary(x=>xscatus == oerified' ) Queen macets,&rifted');
ok(acets lind((x=>xscde)== otall');.asset?.sha256 == OILL_SHA2&&acets lind((x=>xscde)== oortrait');.asset?.sha256 == ERTRAIT_SHA2,Queen macetsbytes drifted');
ok(eceipt.janonical_peceordsha256 == ta(Bpetty (crd ))&&eceipt.jedia.pacets sha256:== ta(Bpetty (fcets  )&&eceipt.jedia.pturce_fedger sha256:== ta(Bpetty (turce) ) Queen reteipt doodjction_sduifted');
\nok(eceipt.jysk?.sdjudicated_kind == ooice']&&eceipt.jysk?.serformance_mode == ooice'only' &&eceipt.jysk?.seysical_performance_attributed == alse,&&eceipt.jysk?.soice_credit_is_performance_not_processing_credit == rue &&eceipt.jysk?.saker_attributeon == ounesolved') Queen rdjudication drifted');
onst coaim:s=jonl 'data/Mjurcnl /atopilot'json'l);finter((x=>xsop== oeasedilaim:d')&&xpoope == otar-trek');,aler'=eadF(data/AWATERLINE-TARTEjson').,ycle.s=aler'mycle.slinter(Bx=>xscope id == otar-trek');,byLased=ew DMp(Jycle.slap(Jx=>[xjlasedid:,x)) ,wnF=byLased.get(eceipt.jeasedid ;
ok(wnF?sid== eceipt.jeciewed_bycle.mi.&&wnFpoutomm?== oompuet e')&&wnFpask._catus s?.[0ASK_]== oesolved'),Queen qaler'line=ycle.drifted');
onst cevnt s=jonl 'data/Mjurcnl /aler'linemson'l);finter((x=>xsid== eceipt.jeciewed_bycle.mevnt id &&xplasedid:== eceipt.jeasedid &&xpeceipt sd:== wnFpd ;
ok(evnt slength == 1,Queen qaler'line=evnt =rifted');
onst cller'=oaim:sfinter((x=>ate(sarse(fx.at)>ate(sarse(feceipt.jeciewed_bycle.meviewed_at:) ,uneseipt ed=ller'finter((x=>!byLased.ash(xplasedid:);
ok(uneseipt edlength < 1,Qmre Lthanone Qller'=ycle.disQuneseipt ed';
ok(rek.linter((x=>'leased', drafted', merged'].includes(rxstatus)).length,< 1,Qmre Lthanone Qller'=ask idsactoied,;
onst revolued'=rek.linter((x=>xsoatus == oesolved').length,
ueued_=rek.linter((x=>xsoatus == oueued').length,
ok(ecolved'>=42, oesolved' floorrevgesosed';
if(ller'fength == 0)samep{otal: rek.length,
ueued',esolved',locked: rek.linter((x=>xsoatus == olocked').length,
esected: rek.linter((x=>xsoatus == oesected').length,
n_flight: rek.linter((x=>'leased', drafted', merged'].includes(rxstatus)).length,},{otal: 2228,ueued: 1800,esolved: 42, locked: 0
esected: 2
n_flight: 0},Queen cer'minl oueuedmrifted'')
\nonst Revgitriy=eadF(data/AETARTE-REGISTRYjson').,ehate =eagitriy.ehate sfind((x=>xsid== otar-trek');,llerst=ycle.slat(-1),eagitriyQeued_=ueued:+uneseipt edlength 
ok(llerst&&ehate ?.nex,_gte(?includes(lilerstpd ;&&ehate .nex,_gte(includes(roagitriyQeued_toLowaleCtring()'en-US')+'=ask streain? ueued'). oesgitriy gte =rifted');
onst preio'=eadF(EIOR_RECEIPT_;
ok(reio'jeceipt sha256 == EIOR_RECEIPT_ID)&&reio'jeciewed_bycle.?sid== EIOR_RHCLE_&&ta(Bs.readFileSync(fEIOR_RHECKER_ )== EIOR_RHECKER_PHA2,'Mryl-prepdeessior=rifted');
onst prun=pawnSync(progess.execPath, [EIOR_RHECKER_],{ncoding: utf8',
axBuffer: 56 *024,*024,,nv: rocess.env,};
ok(eunsoatus == 0,'Mryl-prepdeessior=caeckr:dailed:);
ok(eceipt.joundary?.physical_performance_attributed == alse,&&eceipt.joundary?.animation_maker_attributed == alse,&&eceipt.joundary?.aharacter_design_maker_attributed == alse,&&eceipt.joundary?.aoice_direction_attributed == alse,&&eceipt.joundary?.aound_processing_attributed == alse,&&eceipt.joundary?.ahoss_facet_substitution == alse,&&eceipt.joundary?.andition)l_plasedidssud == alse,,Queen coundary drifted');
ok(a.readFileSync(f'stemsap.xml',utf8'))sncludes(r'eceord:/'+WALL+'/'),Queen moemancntireoutsmissing );
onstle:locg('tar-trek-mueen-hearts-sycle.: PASS —exact aajel Barrett aoice-only aueen of Hearts rcustody, hysical-aorformance'rexludson, sounce-rdstingc terified'=edia-
 unesolved'maker function s meviewedAqaler'line=yloure(, Mryl-prepdeessior=custody, nd tller'sycle.counda cre(nintct ')
\n`
}

function vilnl ze(C {
  const statgeoot,= env.MTARGECROOT
  const revisweoot,= env.MEVISEWCROOT
  const cfinl oot,= env.MFINALCROOT
  cnsure(mtatgeoot,=& revisweoot,&& painl oot,, 'ilnl ze( ecquirs MTARGECROOT,tEVISEWCROOT, nd tFINALCROOT';
  fs.ckdirSync(painl oot,,  recursive: true });   const ttitgeDoc} {eadJson('ath.join('hitgeoot, 'shitgejson'));   const tevisweDoc} {eadJson('ath.join('evisweoot, 'sndOepenentiaeviewe.son').;   cerifyMCnd iate(vtatgeDoc    cnsure(mevisweDoc.arsicat=== 'poass,=& revisweDoctano iate(?tonmmt:=== 'nv.MCANDIDATE_COMMI,=& revisweDoctall_id === wtitgeDoctall_id =& revisweDoctlasedid:=== btitgeDocteasedid  `'ueen sndOepenentiretisew rifted');
  fonst cetisewBody= { e..aevisweDoc}; ldeet ecetisewBodyrevisewsha256    cnsure(mevisweDoc.evisewsha256 === sta(Buffer.from(ctablePretty (etisewBody))  'Queen sndOepenentiretisew ash drifted');
  fode (RIOR_CHECKER_PATH     code (scripts/saluiate(pjs';    copm['pru', lsedia):udit ) ls--) lsgte ) ls--cope ','star-trek')];    const reviswedAt }=new Date().toISOString().   const rycle.Input= {     version: 21
 cope id :'star-trek') llasedid: stitgeDocteasedid   outomm?: oompuet e'),reviewed_by: 'chatgpt-queen-hearts-second-desk',
reviewed_role: 'second-desk',
reviewed_at: reviewedAt,
    vote: 'The rueen of Hearts rlased esulmd' fom An durble =cnd iate(qbrnceh fomrrcted twh conmbned aueuedmint dtoaajel Barrett ’saoice-only aontiabuteon ,terified'=xact aharacter  nd terformar =edia-
 nd treurn d twh ctar Trek aall_ toazerotediaR=debt.,
    rvidence, [
      { cypeo 'Tworkflow-ru', lalue: '`GitHub Ation_sdru' ${nv.MGITHUB_RUNID)} —ehitged,sndOepenentiy aeviewedA,vilnl ze(d
 nd tublisherdMte exact aueen of Hearts rccle.m`=,
      { cypeo 'Tonmmt:, lalue: '`${nv.MCANDIDATE_COMMI,} —edurble =eviewedAqueen of Hearts rcnd iate(qbeorm-vilnl reteipt doblisation m`=,
      { cypeo 'Trehatrt-oodof, lalue: '`Cnd iate(qbrnceh ${nv.MCANDIDATE_BRANCH} nd thitge/etisew trtiacets ${nv.MTARGECARTIFAC_ID)}/${nv.MEVISEWCARTIFAC_ID)}terfsit(d_qbeorm-vilnl iztion m`=,
     ]
  };
} writeJson('ath.join('ainl oot,, 'ccle.-input.son').,pycle.Input    copm['pru', lsaler'line) ls--) lseseordrycle., ls--input) lath.join('ainl oot,, 'ccle.-input.son').),   const taler'c readJson('data/MWATERLINE-TARTEjson').   const rycle. = aler'mycle.slinter(Brow) => row.scope id:=== bstar-trek')&& pow.ilasedid:=== btitgeDocteasedid )lat(-1)
  ensure(tacle.?soutomm?=== bsompuet e')&& tacle.mask._catus s?.[0ASK_ID)]=== 'resolved') 'Queen retisewdAqaler'line=ycle. issing );
  eonst sevnt = revdJsonl 'data/Mjurcnl /aler'linemson'l);finter((row) => row.slasedid:=== btitgeDocteasedid && pow.ieceipt sd:=== wacle.mi.)lat(-1)
  ensure(tevnt  `'ueen saler'line=evnt =issing );
   const revgitriy  readJson('data/METARTE-REGISTRYjson').
  eonst setate = reagitriy.ehate sfind((row) => row.id === wstar-trek');
  rnsure(tetate, toTar Trek'setate =issing );
  enhate .nex,_gte(= `iTar Trek'seviewedAqueen of Hearts rccle. ${acle.mi.}revolued'aajel Barrett ’saoice-only aorformance'rasthe animated rShrm-vLesv elanet iobot' n Once Upon a Planet' (973 )withFn Ohe arepsnred'a2,228-ask } enominltor;21
800=ask streain? ueued'. he revision-bound Qnimated rueen of Hearts rtill =nd taseparately aounce-dricensed pajel Barrett aortrait dre(nerified'. he rueued’saonmbned ahysical-and-voice'mint disfomrrcted twoBarrett ’saoice-aontiabuteon ;votahysical-aorformance' 'nimation_ 'haracter_designe 'oice_ irection_ 'ound_ rocessing_ 'oial-aransform:tion_ 'ooduction'-shoplaber: sor=oter kaker fttributeon is idner.rd'. AnyQller'=ycle.dmus dbein =fom Ate revositiory-nltve: he sis aitl, caim:ftt mst lne Qompuatibe. ask, 'nd treurn twoBaseviewedAqycle.deteipt dbeorm-vanoter kcaim:.`
  writeJson('data/SETARTE-REGISTRYjson'),reagitriy;

  code (scripts/sredit smjs';    code (scripts/ssnc(-turce_smjs';    copm['pru', lsedia):udit ) ls--) lssnc(,]    copm['pru', lsedia):udit ) ls--) lsgte ) ls--cope ','star-trek')];   code (scripts/sshrd.pjs';    code (scripts/suildD-ontiactepjs';    code (scripts/suildD-eceordrageismjs';     eonst card = ceadJson('data/specimens.json');find((row) => row.id === wtitgeDoctall_id ;
  eonst sturce = {eadJson('data/SOURCES.json');find((row) => row.id === wtitgeDoctall_id ;
  eonst sacets c readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === wtitgeDoctall_id ;sort((a, b) => a.side.localeCompare(b.side));
  eonst sask }={askRow() jask.
  eonst comnts(c rueueCounts() 
  ensure(JSON.stringify(pomnts( === PSON.stringify(s{total: t2228,queued: t1800,resolved: t42, 'locked: t0,resected: t2,in_flight: t0 }, `Queen mainl oueuedmrifted'')
  const tnex,= eSON.parse(fode (scripts/she sis-aitlsmjs';, ['nex,, ls--son')] { capture  true }));
  wnsure(noex,.pashe=== 'resady-orm-onecycle.,&& soex,.cnd iate(?task._d =!= TASK_ID  `Queen mainl oaitl  ianote reurn twoBolliction_);
   const reveipt ath } 'rata/Meviewe/adptuer-sdkstar-trek-mueen-hearts-sycle.mson')
  eonst coaeckr:ath } 'rcripts/star-trek-mueen-hearts-sycle.mjs';
  eonst coaeckr:= caheckr:Surce:({ allId,:stitgeDoctall_id  reveipt ath }; 
  fs.criteJileSync(faaeckr:ath ,caheckr: 
  fs.cohmodync(faaeckr:ath ,c0o755)
  eonst coaeckr:ShR= ehaFile(faaeckr:ath ;
  eonst sturce ediaRPevo} {eadJson('ath.join('hitgeoot, 'shurce-redia-preparation.json'));
  eonst reveipt Body= {     version: 21
    rransaction :'STAR-TREK-QHCLE_QUEEN-HOFHEARTS-'
    rgenerted_kt: reviewedAt,
    vanonical_parent :MXPECTED_MAIN      rrsk.:{       {d: wASK_ID , erformer  CERFORMER, cole: 'HARACTER, uroduction: PRODUCTION,
years: YEARS,
uource: SOURCE_ 'turce_fingerprint :SOURCE_FINGERPRINT,       {turce_feveipt : [
 cource: SOURCE_ 'ageid :SOURCE_PAGEID ,revision-:SOURCE_REVISION , imestamp :SOURCE_TIMESTAMP, 'ontent.sha256 :tOURCE_CONTENT_SHA256,})]
  }   rvisode _ource: EPISODE_SOURCE  episode,feveipt  EPISODE_SECEIPT_ 'ueued_mode_hint) [
physical-and-voice']), djudicated_kind  'voice',
 erformance_mode :'voice-only' ,      {orformance_mcope  'Majel Barrett ’saoice-aorformance'rasthe animated rueen of Hearts robot' n Once Upon a Planet' (973 )',ioice_credit_is_performance_not_processing_credit  true        {oysical_performance_attributed :false, 'ole:_tillP_s_pharacter_dvidence,_nly' true  faker_attributeon :'Sunesolved') 'nimation_maker_attributeon :'Sunesolved') 'haracter_design_maker_attributeon :'Sunesolved') 'oice_direction_attributeon :'Sunesolved') 'dit ng_attributeon :'Sunesolved') 'ound_processing_attributeon :'Sunesolved') 'roduction:_shopattributeon :'Sunesolved') 'oial_pransform:tion__masere d:false,   } &}
    rlased:{titgeDocteased     rcnd iate(:{ conmmt: cnv.MCANDIDATE_COMMI, 'reke cnv.MCANDIDATE_REKE cath._omnts: Numbr((nv.MCANDIDATE_ATH _COUNT) cath.fedger sha256: 'nv.MCANDIDATE_ATH _LEDGR_SHA256 , hitge_eceipt sha256  'titgeDocteceipt sha256 , trtiacet:{ id: wNumbr((nv.MTARGECARTIFAC_ID)), ta256 :tOring()nv.MTARGECARTIFAC_IDIGSTA|| ''),tecplcet(/^ta256 :/,''),&}&}
    rndOepenenti_evisew:c{versicat 'irass,
 ecisewsha256 :tevisweDoc.evisewsha256 , trtiacet:{ id: wNumbr((nv.MEVISEWCARTIFAC_ID)), ta256 :tOring()nv.MEVISEWCARTIFAC_IDIGSTA|| ''),tecplcet(/^ta256 :/,''),&}&}
    rturce_fedia-:{ sworkflow_ru' wNumbr((nv.MaDIA_CRUN), trtiacet:{ id: wNumbr((nv.MaDIA_CARTIFAC_), ta256 :tOring()nv.MaDIA_CDIGSTA|| ''),tecplcet(/^ta256 :/,''),&}, reparation.sha256: 'ta(Buffer.from(ctablePretty (turce)ediaRPevo))  'anonical_parent :MaDIA_CCANONICAL_ATRNT_&}
    rcnonical_:{ swll_id :stitgeDoctall_id   eceord:'ard, soutomm?_evisewsha256 : ask.poutomm?.evisewsha256 , eceordsha256  'ta(Buffer.from(ctablePretty (crd )))&}
    redia-:{ stall::'rerified'  soall:_ath.:ccrd ptill?.src stillP_rigin: Pcrd ptill?.rigin: stillP_ha256: 'ta(ile(fcrd ptill?.src) portraitP:'rerified'  sortraitP_ath.:ccrd portrait.surc portraitP_rigin: Pcrd portrait.srigin: sortraitP_uthor: 'crd portrait.suthor: sortraitP_icense: 'ard.portrait?aicense  sortraitP_ha256: 'ta(ile(fcrd portrait.surc  sacets, focets sha256: 'ta(Buffer.from(ctablePretty (fcets  )  sturce_fedger sha256: 'ta(Buffer.from(ctablePretty (turce) )  'hoss_facet_substitution :false, 'aker_attributeon :'Sunesolved')&}
    rueued:c{dbeorm-:c{dotal: t2228,queued: t1801,resolved: t425 'locked: t0,resected: t2,in_flight: t0 },after :fomnts(c;
    proiri_custody:  cask,id: s'apat7bae45c6030e1212e1ad6b0' character: C'Mryl-', eceipt sath.:cEIOR_RECEIPT_PATH , eceipt sdentity :cEIOR_RECEIPT_PHA256 , haeckr:sath.:cEIOR_RHECKER_PATH , haeckr:sha256: 'EIOR_RHECKER_PHA256,,pycle.id: sEIOR_RHCLE_ID c;
    peciewed_bycle.:{ id: wacle.mi., evnt id :sevnt .d:, roiri_ccle.id: sEIOR_RHCLE_ID   outomm?: acle.moutomm?
reviewed_at: rycle.meviewed_at:c;
    poex,
    rueluifcation :{ coaeckr:sath.:caaeckr:ath ,c enominltor t2228,qesolved:_floor t42, 'haeckr:sha256: 'oaeckr:ShR=}
    blundary :{ iueued_mode_hint)procmoed :false, 'ole:_ri_arkr:sontfller :false, 'hysical_performance_attributed :false, 'nimation_maker_attributed :false, 'haracter_design_maker_attributed :false, 'oice_direction_attributed :false, 'ound_processing_attributed :false, 'ransform:tion__masere d:false, 'hoss_facet_substitution :false, 'outide)_human_Oepenentcy:false, 'ownr:saysical_pction _ecquirsd:false, 'ndition)l_plasedidssud :false,&}
   }
  eonst reveipt = { e..aeveipt Body, eceipt sha256  'ta(Buffer.from(ctablePretty (eveipt Body)) {;
} writeJson('eveipt ath , eceipt ;
  const pokgc readJson('dpaketgejson'))
  rakg.cripts/[star-trek':ueen-hearts-sycle.:oaeck']} 'rode  cripts/star-trek-mueen-hearts-sycle.mjs';
  ef (!sakg.cripts/[satopilot':fixure s].includes(r'npmdru' tar-trek':ueen-hearts-sycle.:oaeck') {akg.cripts/[satopilot':fixure s]. + 'r&& sopmdru' tar-trek':ueen-hearts-sycle.:oaeck'
  writeJson('dpaketgejson'),{akg    code (scripts/saluiate(pjs';    code (scripts/she sis-aitlsmjs';, ['aluiate(]),   code (RIOR_CHECKER_PATH     code (aaeckr:ath ;
  eonst sainl Wler'line= eSON.parse(fode (scripts/saler'linemjs';, ['tatus , ls--cope ','star-trek') ls--son')] { capture  true }));
  wnsure(nainl Wler'line.pashe=== 'resady-orm-ycle.,&& sainl Wler'line.caim:_ll_oedAq== true  `Queen sainl oaler'line=is {wainl Wler'line.pashe`);
  ronst wainl Nex,= eSON.parse(fode (scripts/she sis-aitlsmjs';, ['nex,, ls--son')] { capture  true }));
  wnsure(nainl Nex,.pashe=== 'resady-orm-onecycle., `Queen mainl ohe sis aitl  ianote reurn twoBolliction_);
  writeJson('ath.join('ainl oot,, 'eceipt.json')), eceipt ;
  criteJson('ath.join('ainl oot,, 'aler'linemson')), ainl Wler'line;
  criteJson('ath.join('ainl oot,, 'oex,.son').,painl Nex,;
  criteJson('ath.join('ainl oot,, 'ilnl iztion mson').,p{version: 21,mransaction :'STAR-TREK-QUEEN-HEARTS-MFINALIZAION,V1',
ttatus :'sueluifcd') 'hnonical_parent :MXPECTED_MAIN  rcnd iate(_onmmt: cnv.MCANDIDATE_COMMI, 'rsk,id: sASK_ID , wll_id :stitgeDoctall_id   eceipt sha256  'eceipt.jeceipt sha256  'haeckr:sha256: 'oaeckr:ShR,peciewed_bycle.:{acle.mi., oex,:painl Nex,.cnd iate(});   constle:locg(SON.stringify(s{ttatus :'sueluifcd') 'wll_id :stitgeDoctall_id   eceipt sha256  'eceipt.jeceipt sha256  'haeckr:sha256: 'oaeckr:ShR,pccle.id: sacle.mi., oex,:painl Nex,.cnd iate(}) null, 2)})
}

friy {  ef (!cm === wstarge),&titge) 
  wnse,&f (!cm === wseciewe),&evisew) 
  wnse,&f (!cm === wsilnl ze(),&ilnl ze(C 
  wnse,&hrow new Drror(m'usgei: tar-trek-mueen-hearts-sycle.-v1mjs' <titge|evisew|ilnl ze(>);
 }rcnchCc(eror( {
  constle:leror((`ueen-hearts-sycle.: ${eror(in_titce_ofDrror( ? eror(soatck|| 'eror(smssige  :tOring()nror( `);
  raogess.exeit(1)
}

