# Operational reliability evidence lane

The `operational-reliability` roadmap milestone requires measured operating baselines, two reviewed recovery drills, passing service-level targets, and durable incident stop authority. The repository already enforces waterline capacity, cycle receipts, high and critical incident stops, and second-desk or owner authority for reopening a blocked lane. The remaining work is evidentiary.

This lane produces two workflow-executed, unreviewed artifacts. It does not write `data/WATERLINE-STATE.json`, alter `data/ROADMAP-STATE.json`, mutate the live site, or mark the milestone complete.

## Repository-restore drill

The restore drill selects an immutable repository snapshot from `preservation/SNAPSHOTS.json`, downloads the exact release asset, verifies its byte count and SHA-256, rejects unsafe archive paths and link entries, and extracts it into a fresh workspace. Because the preservation package records a specific historical commit, the drill constructs the exact text-only forward delta from that commit to the workflow head, applies it outside a Git worktree, and compares every tracked file and executable bit against the exact target tree.

Only after the recovered tree is byte-for-byte current does the drill install dependencies with `npm ci` and run the complete canonical `npm run gate`, including rendered-browser tests. A passing artifact therefore proves both preservation recovery and exact-head operability.

Binary forward deltas fail closed. A later snapshot must absorb such a delta before the restore can pass. This prevents UTF-8 patch transport from being misrepresented as a byte-exact binary recovery mechanism.

## Isolated publication-rollback drill

The rollback drill builds a deterministic critical-surface bundle from the recovered site. The bundle includes the homepage, the quality ledger, permanent record routes, and image assets. It publishes the known-good bundle into an isolated local slot, atomically injects a bad homepage, proves that the manifest changed, and restores the known-good slot through a same-filesystem directory rename.

The restored slot is then served over HTTP. Every selected route must match the known-good bytes exactly. The drill never deploys to GitHub Pages and cannot modify the live publication.

This representative surface proves the rollback mechanism and byte checks. It is not a claim that every production file was fault-injected.

## Evidence boundary

The workflow uploads:

- `repository-restore.json`
- `publication-rollback.json`
- `bundle.json`
- dependency and gate logs
- the exact forward-recovery patch

Every receipt is marked `workflow-executed-unreviewed`. A second-desk reviewer must inspect the workflow run, receipts, logs, target commit, snapshot, and failure boundary before authoring `waterline record-drill` inputs. The evidence producer cannot review itself.

Metrics remain `null` until an observed denominator exists. One gate duration is an observation, not a p95. No cost, source-freshness, or rights-response value may be inferred from absence.

## Commands

```text
npm run operational:fixtures
node scripts/operational-reliability.mjs select-snapshot
node scripts/operational-reliability.mjs restore-drill ...
node scripts/operational-reliability.mjs rollback-drill ...
node scripts/operational-reliability.mjs validate-bundle ...
```

The canonical gate runs the operational-reliability fixtures through `waterline:fixtures`.
