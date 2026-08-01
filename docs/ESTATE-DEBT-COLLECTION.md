# UnderCast estate debt collection

UnderCast now has an evidence-production system capable of autonomous discovery, independent adjudication, retained failure custody, permanent packet publication, and exact-head recovery. That machinery creates recoverable assets. It does not, by itself, settle the obligations that caused the machinery to exist.

Estate debt is any known gap between retained work and the state the public archive is supposed to possess. The debt includes missing evidence, pending canonical adoption, unmerged branches, unresolved dependency claims, overlapping candidates, undeployed changes, obsolete workflows, unindexed estates, and lessons that remain prose rather than enforced process.

The machine-readable balance is `.github/ESTATE-DEBT-LEDGER.json`.

## Payment test

A collection item is paid only when the intended estate-facing object has moved through the applicable states:

```text
identified
  -> evidenced
  -> packetized
  -> canonically adopted
  -> integrated to main
  -> deployed
  -> maintenance enforced
```

A packet that remains outside canonical data is an asset held against a debt. A canonical change that remains outside `main` is an integration receivable. A merged public-site change without a live deployment receipt remains release debt. A deployed correction without a recurrence guard remains maintenance debt.

No intermediate state may be reported as final payment.

## Current balance

The exact active card-backfill head recorded by PR #129 contains 55 permanent evidence packets and 417 remaining obligations in the frozen 472-facet selector estate. Its contract deliberately keeps canonical mutation false. The active branch is 1,234 commits ahead of and 9 commits behind `main`, and the open draft range from PR #86 through PR #130 contains 45 PRs. The evidence factory is functioning; the principal estate risk is that production continues to capitalize value behind an increasingly expensive integration boundary.

The controlling question for every transaction is:

> Which estate obligation is permanently retired by this change, and what exact receipt prevents it from quietly returning?

## Collection lanes

### Integration and root dependency

The root chain begins with unresolved Ferengi gold work in PR #86 and the website-maintenance handoff in PR #87. The card-backfill work then extends through a long serial stack. The first collection lane must produce one exact-head consolidation transaction against current `main`, not another lateral branch that assumes the old base remains authoritative.

The consolidation transaction must:

1. adjudicate which PR #86 claims survive against current `main`;
2. replay the valid website-maintenance boundary from PR #87;
3. preserve every permanent card-backfill packet and its checksum custody;
4. map every stacked PR to a retained successor, explicit supersession, or terminal rejection;
5. reconcile the nine commits now present on `main` but absent from the active branch;
6. run the complete repository and rendered-browser gates on the resulting exact head.

A stacked PR may be closed only after its retained objects are proven present in the consolidation tree or explicitly rejected with a durable reason.

### Canonical adoption

Every accepted evidence packet creates a corresponding canonical-adoption obligation. Adoption must remain separately gated because evidence custody and canonical mutation answer different questions. The adoption controller should consume exact packet manifests in bounded batches and mutate only authorized `record/side` bindings.

Each batch must prove:

- the canonical facet is still absent or explicitly replaceable on the exact mutation head;
- the selected packet matches the exact record, side, role, production, and chronology boundary;
- source and candidate hashes match the permanent packet;
- repository-wide duplicate and cross-card reuse rules pass;
- projections are rebuilt once after the bounded mutation set;
- the full gate and rendered card wall pass;
- every packet receives an accepted, rejected, superseded, or deferred adoption receipt.

Packet production must never be counted as canonical completion. Canonical adoption must never erase the packet or its failed discovery history.

### Overlap reconciliation

PR #88 directly applies 27 media facets, while the later evidence-only chain contains overlapping records and may contain different candidates or stronger custody. Before either lane reaches a consolidation branch, an exact overlap table must be generated with at least:

```text
record
side
PR #88 candidate hash
later packet candidate hash
same bytes or different bytes
custody comparison
winner
loser disposition
canonical status
```

No record/side may be applied twice. A later packet does not automatically win merely because it is newer, and PR #88 does not automatically win merely because it performs canonical mutation. The evidence and current canonical boundary decide.

### Production and policy experiments

The autonomous selector campaign may continue because it has proved unattended scheduling and retained-frontier recovery. Its output, however, remains subordinate to the debt ledger. It may not conceal adoption or integration balances, and it may not create a new independent frontier when the integration lane lacks a current transaction.

PR #130 is an experiment against a stale parent description. Its prior receipts remain evidence, but activation requires replay on the exact current parent, current denominator, and current policy inheritance. The experiment must either produce a bounded policy delta with measured yield or be closed as superseded.

### Deployment and retirement

A public-site obligation is paid only after the integrated commit is the object served by GitHub Pages and the live routes pass the required media, navigation, and rendered-browser checks. The deployment receipt must identify the deployed commit and preserve a rollback boundary.

Workflow and control growth is also debt. Every active workflow must have one declared owner and one current responsibility. Every superseded workflow must be retired or classified as retained evidence. A new workflow must name what it replaces or state the new permanent responsibility it creates.

## Collection order

The estate should service debt in this order while allowing already-authorized production to continue in parallel:

1. Build the exact-head consolidation and PR supersession map.
2. Resolve the Ferengi and website-maintenance root dependency against current `main`.
3. Reconcile PR #88 against the permanent packet chain.
4. Establish bounded canonical-adoption batches for the 55 packets.
5. Replay or close stale source-policy experiments.
6. Merge, deploy, and verify the consolidated estate object.
7. Retire obsolete workflows, branches, and PRs using exact successor receipts.
8. Continue draining the remaining selector estate under the inherited evidence policy.

## Failure modes

The collector must reject the following substitutions:

- commit count for integrated value;
- packet count for canonical completion;
- merge for deployment;
- deployment for maintenance enforcement;
- an `absent` disposition for exhausted discovery;
- a new workflow for a repaired operating process;
- an open PR as durable custody when no successor map exists;
- branch-local truth as a statement about `main` or the live site.

The estate may carry debt deliberately, but it may not carry it invisibly.
