# Bounded DS9 source and corpus-operations repair

Implementation evidence for independent inspection, based on
`a947fdef0b605ce09674cbc26f8d6ddf59e5ca63`. This patch is not integrated or
published. It changes source parsing, source-backed DS9 rows and their projections,
and fail-closed lease recommendations. It creates no owner determination.

The single controlling worklist remains
`D:/Projects/Products/UnderCast/reviews/uc-1.0-20260911/WORKLIST.md`.
This directory contains supporting evidence, not another work queue. The supplied
`../reviews` path resolves one directory too low from this worktree; the actual
worklist and complete `corpus-ds9-review.md` were read at the path above. No sibling
file was written. The existing maker contract is `data/ds9/MAKER.md`;
`data/ds9/MAKER-ATTRIBUTION.md` is absent.

## Implemented and rechecked mechanisms

- `ds9-census.mjs` now splits role separators only outside links, nested templates,
  parentheses and annotations. It rejects broken markup instead of treating its
  fragments as page-less character facts. The production cast parser is directly
  importable without running a crawler, so fixtures exercise the actual parser.
  Exact credit lines, credited link/display spellings, and episode/revision/hash
  locators survive. Typed doubling/utility rejections retain one disposition per
  exact credit/revision, including all post-resolution doubling occurrences.
- The name prefilter accepts linked `Nicole deBoer` and `Tim deZarn`. Unknown
  performer placeholders and existing negative cases remain rejected. Name shape
  is a candidate filter; source page identity resolution remains separate. Missing
  individual performer resolution stays unresolved rather than becoming a
  name-derived performer key.
- Redirect fragments now survive identity resolution. A section of an aggregate
  page cannot supply an individual character page ID. The two alien credits retain
  their exact linked role targets and distinct source keys.
- Both owner-review queues take wall membership from current `coverage.json`,
  joined by `duplicate_key`. Missing, duplicate or malformed coverage fails the
  projection. Historical dossiers remain untouched; migration aliases do not
  rebind evidence IDs or owner decisions. New keys disclose missing current
  eligibility dossiers. Salome Jens's linked and page-less dossiers remain separate.
- Offline `ds9-graph.mjs --reconcile-roster` repairs only episode-credit portrayals
  and the affected endpoints, then derives graph projections. Every non-portrayal
  relationship remains equivalent to the original evidence. Ordinary
  `--project-only` remains a network-free projection of existing nodes/edges.
- `nextOperation` recommends a lease only for `claimAllowed === true`.
  False, undefined, null, malformed values and the CLI subprocess-failure
  equivalent return a held `inspect-waterline` action with a reason. The actual
  local failed-status path now does this too. No lease history changed.

## Exact source correction and identity continuity

Retained cache/evidence was checked first. This worktree had revision receipts
and excerpts, but no matching raw episode capture cache. Read-only inspection of
the retained historical roster at
`79dc887f528f8bbcacaddbe740290ad0cdd7c988` recovered the missing doubling locators;
no source reset or historical checkout modification occurred.

The existing DS9 MediaWiki adapter retrieved **33 affected episode revisions**
using explicit `revids`, with no category census or current-page body substitution.
Every page ID and full wikitext SHA-256 matches `observations.json`. The original
173-page capture identity and observation bytes remain unchanged.
[pinned-episode-capture.json](pinned-episode-capture.json) retains full bytes,
original capture locators, retrieval times, revision URLs and contributor
attribution. Its role-credit sources include:

| Credit | Episode revision | Disposition |
|---|---|---|
| Bill Blair | Statistical Probabilities / 3449374 | One intact head-tendrils-and-facial-spines link replaces two parser fragments. |
| Ivy Borg | Rules of Engagement / 3453347; Sons of Mogh / 3471926 | Two intact pink-skin-and-bulbous-head links establish one performer-role assertion with two citations and both display spellings. |
| Terry Farrell | Penumbra / 3447111 | Exact source says `photograph and voice over`; it annotates Jadzia Dax. The existing Jadzia citation is retained, with the exact source credit, and the spurious role is retired by alias. `archive footage and voice over` is also a parser regression fixture, not substituted as the historical quote. |
| Nicole deBoer | Image in the Sand / 3492911; Once More Unto the Breach / 3446858; Shadows and Symbols / 3448135 | Three Ezri citations join existing `p8312|c4556`; Nicole de Boer page ID 8312 and credited alias remain separate fields. |
| Tim deZarn | Wrongs Darker Than Death or Night / 3491477 | Source resolver identifies Tim de Zarn page 16066 and Halb Daier page 28061; `p16066|c28061` is a source assertion under review, not a face-eligibility approval. |

[identity-resolution.json](identity-resolution.json) records the existing
redirect/page-ID resolver results separately from the pinned episode assertions.
Both alien targets currently redirect to page 233712, **Deep Space 9 visitors**,
but to different fragments: `Tendrils 001` and `Alien 0407`. That aggregate ID was
not assigned to either individual role. Individual page IDs remain unresolved.
No contemporary page text was used to rewrite a historical performance claim.

Five explicit historical roster aliases are in
[`data/ds9/key-aliases.json`](../../../ds9/key-aliases.json):

| Historical key | Current source key |
|---|---|
| `p79012\|t:facial spines 001 alien with head tendrils` | `p79012\|c:alien with head tendrils and facial spines 001` |
| `p79012\|t:facial spines` | Same Bill Blair source key |
| `p143204\|t:bulbous head 001 alien on promenade` | `p143204\|c:alien with pink skin and bulbous head 001` |
| `p143204\|t:bulbous head 001 promenade alien` | Same Ivy Borg source key |
| `p10126\|t:voice over` | Existing `p10126\|c128912` |

The corresponding five retired graph endpoints also have explicit tested aliases.
No specimen/record ID changed. `p6631|c205` and `p6631|t:female changeling` are not
aliased to each other. Their graph display endpoint continues to collapse one
portrayal without collapsing either historical dossier.

## Count reconciliation

| Unit | Before | After |
|---|---:|---:|
| Corpus cards / populated media sides | 1,368 / 2,039 | unchanged |
| Global census rows / coverage assertions / unresolved rows | 6,839 / 6,664 / 11,027 | unchanged |
| DS9 revision-bound episode pages | 173 | 173 |
| DS9 roster assertions / unique keys | 557 / 557 | 555 / 555 |
| Performer page identities / credited spellings | 398 / 404 | 399 / 406 |
| Character identity units | 321 | 319 |
| Individual character page IDs / distinct labels without one | 313 / 8 | 314 / 5 |
| Assertions with / without individual character page ID | 546 / 11 | 547 / 8 |
| Episode citations | 1,756 | 1,758 |
| Named non-background / other assertions | 246 / 311 | 247 / 308 |
| Current covered assertions / cards | 78 / 77 | 78 / 77 |
| Current off-wall assertions | 479 | 477 |
| Each queue's covered assertions / cards | 36 / 32 | 78 / 77 |
| Each queue's current review rows / owner decisions | 557 / 0 | 555 / 0 |
| Historical eligibility dossiers | 557 | 557, bytes unchanged |
| Maker receipts / verified receipts / signal-bearing performances | 47 / 41 / 163 | unchanged |
| Unresolved ledger entries | 157 | 152 |
| Graph nodes / edges / portrayals | 898 / 1,362 / 556 | 897 / 1,360 / 554 |

Roster arithmetic: retire five malformed rows; add one Bill role, one Ivy role
and one Tim role: `557 - 5 + 3 = 555`. Nicole adds three episode citations to an
existing identity. Bill contributes one and Ivy two replacement citations; Tim
adds one. Terry's actual Jadzia citation already existed:
`1756 - 5 + 1 + 2 + 3 + 1 = 1758`.

Unresolved arithmetic: `157 - 4 + (59 - 48) - 12 = 152`.
The 48 aggregated doubles describe 59 exact episode occurrences, all now located
and checked against pinned text. Twelve duplicate exact-credit observations
coalesce, including two overlaps discovered during locator recovery. Every old
entry, source spelling and rejection reason remains in
[migration.json](migration.json); successor rows retain `legacy_indices` and
`reason_history`. No unique source observation was deleted to reduce the count.
All **66 unknown-performer entries** remain unknown.

## Verification on the actual patch

Full stdout, stderr and exits are in [validation.json](validation.json).

| Offline command | Result |
|---|---|
| `node scripts/ds9-fixtures.mjs` | 3382 source-repair assertions plus 52 existing identity/graph/provenance checks pass. |
| `node scripts/ds9-eligibility-fixtures.mjs` | 42 checks pass. |
| `node scripts/ds9-maker-fixtures.mjs` | 36 checks pass. |
| `node scripts/census-fixtures.mjs` | 21 cases pass, including existing fictional-performer and annotation negatives. |
| `node scripts/census-gate.mjs` | 78/78 Ferengi source identities accounted: 61 covered, 9 excluded, 8 unresolved. |
| `node scripts/corpus-ops-fixtures.mjs` | 30 assertions: 13 existing and 17 added fail-closed assertions. |
| `node scripts/corpus-ops.mjs validate` | Pass. |
| `node scripts/corpus-ops.mjs next` | Held `inspect-waterline` under the actual unavailable child-process status. |
| `node scripts/validate.mjs` | 30 invariant profiles, 1,368 specimens and 2,039 image references; no invariant violations. |

Every queue row's `wall_ids` set and flag is tested against current coverage;
coverage is independently rematched against specimens. Tests also verify exact
aliases, source revision hashes, all 59 doubling occurrences, preservation of
every historical rejection, zero fabricated approvals, the two Salome dossiers,
and unchanged relationship evidence.

Re-running DS9 coverage, both queues, roster portrayal reconciliation and graph
projection changed **zero of 25 DS9 JSON files**. Scoped `git diff --check` passed.
No acquiring wrapper, full gate, browser suite or port 4173 operation was run.

## Changed paths and retained boundaries

Code: `scripts/ds9-census.mjs`, `scripts/ds9-eligibility-queue.mjs`,
`scripts/ds9-maker-queue.mjs`, `scripts/ds9-graph.mjs`,
`scripts/lib/ds9-coverage.mjs`, `scripts/lib/ds9-portrayals.mjs`,
`scripts/lib/corpus-ops.mjs`, and their DS9/source/eligibility/maker/operations
fixtures. `ds9-fixtures.mjs` imports the new source fixtures; no package or gate
helper was changed.

DS9 data: `roster.json`, `unresolved.json`, `manifest.json`, `coverage.json`,
`summary.json`, `key-aliases.json`, both queues and summaries, and graph
`nodes.json`, `edges.json`, `projections.json`, `graph-summary.json`, `manifest.json`.
The seven files in this evidence directory support the controlling worklist.

Original roster SHA-256:
`c272496d28f5f662a18b5a16a848a956c0e7e72ce2f1fa0bda12c7d9bd501a3f`.
Corrected roster SHA-256:
`c0399bc3cdb2e4c113de528311bb9a2341c67fe1615206aa163f90610513db20`.
Pinned episode capture SHA-256:
`f6f84e6030d4f9a8fab054a9c7ba100ff8485134156a15a072b460360b9a2b4e`.
The migration receipt lists all original/current DS9 hashes and all 33 exact
source identities/hashes. Original observations, eligibility/maker evidence and
owner-decision files retain their original bytes. Global specimen, source,
census, census-manifest, census-unresolved and census-coverage anchors match.

Remaining gaps are real: the two individual alien page IDs are unresolved; the
three new current keys have no current-key eligibility dossier; all current
eligibility/maker work remains under owner review. Unknown performers remain
unknown. No years, aired-installment map, makers or decisions were inferred.

The fresh N01 resolver probe failed first at its unwritable default runtime and
then at transport using temporary runtime files. This patch used only the
operator-confirmed N01 → W01 delegation already supplied for this implementation
slice. No Estate/Clifford source, service or registry was edited. Candidate Git
inspection used a command-scoped trust exception for this explicitly authorized
candidate only; no old satellite ownership guard or global Git configuration was
changed.

Frontend/rendering, contradictory exact-subject reviews, preservation
reconciliation, integration, archive/build regeneration and full release checks
remain with the controlling session and the other named writer. No commit, push,
merge, tag, deployment, owner approval, human visual receipt, or shipped-version
claim was made. Original dirty checkout and recovery objects remain untouched.
