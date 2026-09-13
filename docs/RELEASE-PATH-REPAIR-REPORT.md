# Candidate repair verification — 2026-09-11

Implemented the bounded DEC-0012 publication/correctness repair. This is an
uncommitted candidate, not a released product or a full-gate pass. The controlling
session retains independent review, integration, browser/manual inspection and
release verification. No owner ruling or second-desk approval is asserted.

The operator supplied base commit `a947fdef0b605ce09674cbc26f8d6ddf59e5ca63` and
tree `a2f057d90a778b11dcb95286f99ca8495f69dda4`. Git could not independently confirm
checkout identity in this sandbox because of the Administrators/account ownership
warning. No trust exception, ownership/ACL change or sandbox override was made.

## Changed paths

| Paths | Change |
| --- | --- |
| `package.json` | Ordinary build becomes offline compilation; adds publication fixture command. Retrieval remains explicit. No dependency or lockfile change. |
| `scripts/publication.mjs` | Archive-derived allowlist, deterministic input/media/payload manifests, isolated compilation, exact dependency/link checks, bounded explicit external verification. |
| `scripts/publication-routes.mjs` | Exact specimen+tombstone IDs and route contents, duplicate rejection, both tombstone dispositions. |
| `scripts/publication-release.mjs` | Clean commit/tree/input binding, complete-gate receipt and exact artifact verification. |
| `scripts/publication-fixtures.mjs` | 48 focused regressions, isolated restore and two-build comparison. |
| `scripts/gate.mjs` | Retains all 26 prior steps and adds publication fixtures; exact route check; diagnostic-only partial output; release/verification entry points. Projection drift checks target data/discovery rather than unrelated implementation edits. |
| `scripts/gate-fixtures.mjs` | Real route-file fixtures and immutable-action checkout matching. Existing test assertions remain. |
| `scripts/historical-temp.cjs` | Runtime adaptation of one exact sealed temporary prefix. |
| `scripts/star-trek-history-composable.mjs` | Propagates the portability preload through historical Node children. |
| `scripts/build-record-pages.mjs` | Only filesystem URL handling changes to `fileURLToPath`, fixing spaces/escaped paths in isolated builds. No generated markup, record interpretation or experience logic changes. |
| `.github/workflows/validate.yml` | Same canonical gate, pinned actions, no persisted checkout credentials. |
| `.github/workflows/pages.yml` | Trusted-main read-only full-gate build, exact allowlisted artifact, separate deploy-only job, unique run/attempt artifact name. |
| `.gitignore` | Ignores generated `.ci/` outputs. |
| `PROJECT_ESTATE.json` | Removes retired empty S:/Projects root/anchor and corrects scratch to the current typed Runs class. No move or new root creation. |
| `README.md`, `docs/RELEASE-PATH.md` | Correct intake/build/release instructions and publication inventory. |
| `data/review/estate-debt/UC-RELEASE-PATH-20260911.json` | Small incident receipt; no corpus, roadmap or media decision. |
| `docs/RELEASE-PATH-REPAIR-REPORT.md` | This verification report. |

No HTML, CSS, canonical corpus/media facts, ROADMAP-STATE, collection or
certification state was edited. Generated `records/` and `.ci/` are disposable
outputs. There were no commits, pushes, merges, tags, deployments, workflow
triggers, edits to Estate/shared authority, or changes to protected old checkouts.

## Executed checks

| Check | Actual result |
| --- | --- |
| `node scripts/publication-fixtures.mjs` | **PASS, 48 fixtures.** Includes equal-count wrong-ID routes, duplicate IDs, missing routes, merged and removed tombstones, symlink directory, traversal/reserved paths, missing/corrupt media, refreshed-contract malicious content, forbidden review paths, external URL boundaries, artifact tampering/missing/extra files, CRLF tampering, static dependencies, sitemap identity, partial-release refusal, workflow permissions and pins. |
| Isolated restore + two builds | **PASS.** Declared inputs only, path containing spaces, LF versus simulated CRLF checkout, no optional local release mirrors; identical complete identity. Uses existing preservation SHA-256 manifest parser. |
| Separate final build | **PASS, 1,686 payload files, 322 input entries, 2,039 media identities.** Output `.ci/final-site`; identity `.ci/final-build-identity.json`. |
| `node scripts/validate.mjs` | **PASS, all 30 invariant profiles; 1,368 specimens, 1,368 source rows, 2,039 image refs.** Quality floors unchanged. |
| `node scripts/corpus-audit.mjs` | **PASS, 1,368 records.** |
| `node scripts/site-seams.mjs` | **PASS:** navigation, recovery, state, accessibility and snapshot coherence. |
| `node scripts/site-sweep.mjs` | **PASS:** 1,368 wall records, 259 exact species-tagged records, five root surfaces and permanent records. |
| Publisher custody + write-condition scans | **PASS:** 37 workflows, zero violations; 9 PR workflows, 2 checked PR write jobs. |
| `npm.cmd ci --dry-run --offline` | **PASS.** No dependency changes. |
| Syntax checks | **PASS** for publication, release, gate and historical runner modules. |
| Source/patch inspection | **PASS:** all 87 data inputs captured by the first build retain their hashes; all 18 changed paths pass trailing-whitespace inspection. Git-based diff verification remains blocked by ownership. |
| Real sealed temporary statement | **PASS on Windows in a fresh Node process with the propagated preload.** The exact immutable `mkdtempSync` statement is extracted and executed; unrelated missing prefixes still fail. This is not a claim that the entire historical validator passed. |
| `npm.cmd run gate` | **FAILED at gate-fixtures.** Sandbox denies piped child creation: `spawnSync node.exe EPERM`; the fixture's Git process also cannot start. Later canonical steps did not execute in this run. |
| `npm.cmd run star-trek:lwaxana-eligibility-rejection:check` | **BLOCKED:** `spawnSync git EPERM` while resolving the repository root, before exact historical worktree materialization. Full real historical-validator replay remains unverified here. |
| `npm.cmd run test:rendered` | **BLOCKED:** Playwright exits with `spawn EPERM`, before browser tests. No browser count or visual pass claimed. |
| Partial release and verification without receipt | **PASS as negative checks:** `--release --skip-rendered` refuses; `--verify-release` fails on absent receipt. No release receipt exists. |

The preserved Lwaxana checker still hashes to
`b93d590bb9be5fe111e35ed53fd433154f13cd8a97d9e93cbdde880a59d37947`.
Its preserved composable wrapper hashes to
`3f761ffde089734b7d2b6613e1e19b2bc23aacf8c4d8936a63a73a229e0ef9f3`.
The repair changes neither preserved file.

## Deterministic identities actually computed

The two-build fixture and separate final build agree:

```text
payload SHA-256 b61bc129bd81984903e41d1bc331e39a9b80c9eb2299611b1036f50434ff8991
input   SHA-256 bb53e57603823da5c161845ce5ba9b2ae502f5a427a8cc7c8fd4bce9f914f944
media   SHA-256 3e5d8e3b0fca2becd1b25f9b77f7f3de221ddb46c4fb1c9027a0f9769ddb3f2e
```

The payload has 1,370 permanent routes (1,368 live + 2 retired), 23 public evidence
files, 200 canonical local images and two existing local homepage dependencies.
1,839 current external media identities retain GitHub URLs; compilation performs
no external fetch. The complete live mapping also retains historical declarations.
The digest is for the sorted exact-byte payload manifest, not a tar container
whose metadata can vary. No new runtime timestamp enters these identities.

These are **candidate build identities**, not a gated commit/tree receipt.
The final input manifest binds the implementation bytes used for compilation.
Native Linux execution and the integrated clean-checkout release path still need
the controlling session's exact-result full run.

## Logs and repeat commands

Logs are under ignored `.ci/`: `publication-fixtures.log`, `final-build.log`,
`complete-gate.log`, `historical-replay.log`, `archive.log`, `corpus.log`,
`site-seams.log`, `site-sweep.log`, `rendered.log`, `publisher-custody.log`,
`publisher-conditions.log`, `lockfile.log`, `partial-release.log`, and
`release-verify-negative.log`. The final standalone artifact is `.ci/final-site`.
An earlier development `.ci/site` output is superseded by it and has no release
receipt. Automatic command policy rejected cleanup of that generated directory;
the final check used a fresh output instead, without bypassing the restriction.

```text
npm.cmd run publication:fixtures
npm.cmd run gate
npm.cmd run star-trek:lwaxana-eligibility-rejection:check
npm.cmd run test:rendered
```

Use `npm` instead of `npm.cmd` on Linux. In a fresh checkout, `npm run build`
creates `.ci/site`. In the controlling session's reviewed, integrated clean
checkout, `npm run gate -- --release` followed by
`node scripts/gate.mjs --verify-release` repeats the release boundary without
deploying. No gate category should be skipped to obtain publication authority.

The optional online media verifier was not run: this sandbox's direct GitHub
network transport failed through its unavailable proxy. Provider action release
pins and separate-job contracts were inspected through the read-only web tool;
links are recorded in `docs/RELEASE-PATH.md`. External availability, human visual
review, exact historical replay and complete canonical gate status remain open
verification requirements, not approvals or another work queue.

## Controlling-session resume ? 2026-09-12

The controlling session resumed this candidate on the physical W01 checkout. The
sandbox limitations above no longer describe the current execution environment:
publication fixtures pass 51 adversarial cases; the core corpus, DS9, route and
archive validators pass; the deterministic rendered chain passes 47 checks; and the
broader Chromium, Firefox and WebKit desktop/mobile matrix passes 63 checks. These
are agent-run results, not owner or human visual approval.

The page shell now loads the accepted Fraunces and Space Mono families from verified
local WOFF2 bytes. The previous snapshots had deliberately blocked the external font
origin and therefore captured fallback metrics. Nine updated deterministic snapshots
were inspected across the root surfaces and complete, partial, voice-only and
all-media-absent record states. The prior snapshots remain in external review custody;
no new visual primitive or typography decision was asserted.

UC-MEDIA-AUDIT-1 is preserved as a 286-line historical journal rather than merged as
an obsolete specimen snapshot. Its 77 attention rows reconcile to 72 portraits still
unpublished, one different verified replacement and four exact assets retained only
under current hash-bound source and presentation review. The 73 disallowed campaign
objects and 71 earlier correction obligations now form a 144-rule fail-closed media
rejection projection enforced by both retrieval and candidate reporting.

A clean exact-result full gate, release receipt, commit integration, tag, CI run and
Pages deployment remain unclaimed at this checkpoint. The canonical N01 coordination
probe still fails invariant A2 with `CONTROL_PATH_REGRESSION /
REMOTE_SHELL_FAILURE`; W01 verification continues only for independently authorized,
reversible work. Push, tag and deployment remain reserved for restored coordination.
