# Preservation — make the archive survive its suppliers

UNDERCAST is a preservation system that publishes a website. The repository is
not allowed to treat a live wiki, GitHub, one cloud account, or git history as a
permanent source of truth.

The preservation contract has three independent payloads:

1. **Exact source evidence** — every MediaWiki revision named by
   `data/CENSUS-MANIFEST.json`, stored as original wikitext with page/revision
   identity, timestamps, producer hashes, source URLs, revision attribution,
   source-site license metadata, and observation facets.
2. **Current archive snapshot** — a restorable copy of the current repository
   working tree, excluding generated browser-test output and `.git` internals.
3. **Pre-R1 originals** — the 1,520 full-resolution image sides recoverable only
   from the pinned pre-resize git commit, separated from public source evidence
   because many image rights are copyright-or-unknown and takedown-sensitive.

All three are content-addressed and verified before a receipt is written.

## Survival model

| Failure | What remains recoverable |
| --- | --- |
| A source wiki disappears | Captured exact revisions, derived census facts, source hashes, attribution metadata, and all previously filed records |
| GitHub disappears | Independently replicated public preservation bundle and controlled originals bundle |
| A source page changes | The exact revision used by the producer remains immutable in the source BagIt bag |
| A crawler extracts bad data | Producer fixtures, source bytes, revision receipts, semantic review, and durable correction history permit replay and repair |
| A rights takedown applies to an image | Takedown-sensitive bytes can be purged while hashes, metadata, provenance, and audit receipts remain |
| One cloud account is lost | GitHub release plus an independently verified provider copy; future institutional snapshots add further providers rather than replacing either |

A Wayback capture is useful as a human-readable mirror, but it is not the
canonical preservation proof: crawlers may be blocked, pages may be rewritten,
and the archived render may not correspond to the exact API revision parsed by
the producer. The exact revision BagIt payload is the authoritative replay
source. Wayback or another web archive may be added as a secondary location.

## Current files

- `baseline-manifest.json` — immutable inventory of the pre-R1 originals:
  `{id, side, current, original, transform, origin, license}`. It pins commit
  `17cc010a5ec6cba29189ce92165d1f226961b33f` and records the expected SHA-256 and
  byte count of every original.
- `SNAPSHOTS.json` — append-only preservation registry. It records public release
  assets, scope-local source receipts, independent provider copies, verification
  times, hashes, byte counts, and the history-guard state.
- `BOOTSTRAP-PENDING` — temporary fail-closed sentinel. The bootstrap workflow
  removes it only after source and originals bags have been built, verified,
  published/uploaded, and the Star Trek producer has been re-certified against
  the source-snapshot gate.
- `../scripts/preserve-sources.mjs` — fetch exact MediaWiki revisions by revision
  ID and refuse an incomplete or hash-divergent source bag.
- `../scripts/preserve-bag.mjs` — recover and verify pre-R1 originals from the
  pinned git commit into a rights-aware BagIt bag.
- `../scripts/preserve-verify.mjs` — verify BagIt payload and tag manifests plus
  UNDERCAST source/original receipt contracts.
- `../scripts/preserve-receipt.mjs` — record the public release transaction.
- `../scripts/preserve-offsite.mjs` — record an independently verified provider
  upload using the provider-reported SHA-256 and byte count.
- `../scripts/preserve-status.mjs` — report current source, repository, originals,
  scope, and history-guard durability.
- `.github/workflows/preserve.yml` — bounded export, verification, release,
  artifact, certification, and receipt workflow.

## Exact-source archive

Run from a full clone:

```bash
node scripts/preserve-sources.mjs /safe/output/source-bag
node scripts/preserve-verify.mjs /safe/output/source-bag
```

The bag contains one payload file per distinct exact revision, not one file per
category observation. Duplicate observations retain all facets in
`source-index.jsonl`. Every payload byte must equal the `content_sha256` recorded
by the census producer. The exporter first requests the named revision ID. A
current-page fallback is accepted only when its byte hash exactly equals the
recorded revision content; title similarity or a newer page is never accepted.

The bag also retains:

- page ID, revision ID, parent revision, revision timestamp, revision user and
  comment where exposed by the source API;
- original page, `oldid`, and history URLs;
- source-site name, language, MediaWiki version, and advertised rights URL/text;
- the complete census manifest and scope-local hashes used by Autopilot.

No source images are copied into the source-evidence bag.

## Full-resolution originals and the history guard

The full-resolution pre-R1 images still live in git history until exported:

```bash
node scripts/preserve-bag.mjs /safe/output/originals-bag
node scripts/preserve-verify.mjs /safe/output/originals-bag
```

**Do not run `git gc --prune`, `git filter-repo`, BFG, or any force history
rewrite unless all of the following are true:**

1. `preserve-bag.mjs` recovered all 1,520 originals from the pinned commit.
2. Every original matched the baseline SHA-256 and byte count.
3. The finished originals bag was uploaded outside GitHub.
4. The independent provider reported the same SHA-256 and byte count for the
   uploaded bundle.
5. `preservation/SNAPSHOTS.json` records `history_guard.status` as
   `offsite-verified` and `precondition_met: true`.

Even then, preservation only satisfies a prerequisite. It never authorizes a
history rewrite. `destructive_rewrite_authorized` is permanently required to
remain `false`; a separate explicit owner decision would be required.

## Public and controlled storage

The preservation workflow publishes these immutable GitHub Release assets:

- exact source-revision BagIt archive;
- current repository snapshot;
- verification reports and registry copy.

It deliberately does **not** publish the originals bag. That payload is uploaded
as a controlled workflow artifact and then copied to independent storage. The
registry records the independently reported digest and byte count for both the
public bundle and the controlled originals bundle.

Rights classes are conservative:

- `free` — public-domain, CC0, or identified CC-BY/CC-BY-SA material;
- `copyright-or-unknown` — fair-use/fan-use or missing license metadata. Keep
  mutable and takedown-capable; do not WORM-lock it;
- metadata, hashes, attribution, and audit events — retained even if bytes must
  be removed.

## Lease gate

A source snapshot is not merely a backup report. For a scope that declares
`require_source_snapshot: true`, Autopilot issues no new Luna lease unless the
current scope-local census manifest hash has a published source-bag receipt.

A scheduled source refresh may complete and keep the producer certification
valid, but the refreshed scope becomes temporarily non-lease-ready until its new
exact revisions are archived. Existing canonical records remain available; only
new autonomous work is blocked. This converts preservation lag into visible
backpressure instead of silent evidence loss.

## Operator commands

```bash
npm run preserve:fixtures
npm run preserve:status -- --json
npm run preserve:status -- --require-current \
  --require-scope-archives --require-originals-offsite

npm run autopilot -- readiness --scope star-trek --require-active
```

To record a provider-verified copy:

```bash
npm run preserve:offsite -- \
  --snapshot preservation-YYYYMMDD-<commit> \
  --provider google-drive \
  --file-id <provider-id> \
  --name <uploaded-name.zip> \
  --kind public-bundle \
  --sha256 <provider-reported-sha256> \
  --bytes <provider-reported-byte-count> \
  --url <provider-link>
```

Repeat with `--kind originals-bag` for the controlled originals bundle. Do not
record a local digest as an offsite receipt; the digest and size must be read
back from the independent provider after upload.

## Restore drill

A preservation copy is useful only when it restores independently. A complete
restore drill must:

1. download the independent public bundle without using the GitHub repository;
2. verify the provider object hash;
3. verify the source BagIt and repository archive manifests;
4. rebuild deterministic projections and permanent routes from the repository
   snapshot;
5. resolve representative citations from the archived wikitext with the source
   index, not through a live wiki;
6. separately verify the controlled originals bag and sample restored images;
7. publish a durable drill receipt, including failures and corrective actions.

The first external-provider upload closes the immediate single-provider rescue.
Recurring restore drills and additional institutional copies remain part of the
`operational-reliability` and later preservation milestones.
