# Doctor Who correction drill 001

This controlled exercise pays the correction-drill requirement for the completed Doctor Who pilot without creating a real public report, changing the canonical record, consuming another lease, or completing the roadmap milestone.

## Exact target

```text
base main:             ae699cdd24d62ab4c5e0c81722d7d688152c54e1
record:                UC-1345
performer:             Dan Starkey
role:                  Commander (The Sontarans)
performance mode:      voice
source page:           Tardis Wiki 246488
source revision:       3330636
source SHA-256:         2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966
pilot task:            ap_6dfcb7b9254c26dc3f4b46b8
pilot lease:           lease_51e3223a4810f3681aff9df4
```

The adverse input deliberately asks the correction path to do two wrong things:

```text
rename Commander (The Sontarans) to Commander Slite
+
attach a generic Sontaran character image
```

The terminal result is rejection.

## Certified source separation

The checker does not accept the exercise ledger as its own source proof. It reads the live certified Autopilot and preservation custody:

```text
Commander task:        ap_6dfcb7b9254c26dc3f4b46b8
Commander source:      page 246488 / revision 3330636
Commander content:     2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966

Slite task:            ap_0606b27614b2d76b29e1f789
Slite source:          page 246485 / revision 3416320
Slite content:         eae385ba9d21bd3238a3280dd7de4d076e8c2a496eff8d6dd7d384217bbf8e50

preservation snapshot: preservation-doctor-who-169391a8bf64
scope manifest:        96202b4c128a3729fb7cf3e52b4c36f32a25a156c0df92d1aa379de99fb58f00
source archive:        1526b095c31c046e92de020854058088c970c42d8c9cf400179f1368c16c0211
```

The two Dan Starkey roles remain different tasks with different URLs, page identifiers, revisions, fingerprints, and content hashes. The Commander task resolves to `UC-1345`; the Slite task cannot resolve to that wall record.

## Honest media

The exact Commander performance is audio-only. `UC-1345` retains two explicit media absences:

```text
character still:       absent
performer portrait:    absent
generic Sontaran use:  forbidden
portrait substitution: forbidden
```

A generic Sontaran image cannot establish that the depicted subject is this Commander. A Dan Starkey portrait cannot substitute for the character facet.

## Non-freezing correction boundary

The drill preserves the production ledger's historical hash as transaction evidence, but the permanent checker does not require the live production ledger to remain empty forever. Future real correction cases are permitted.

The live gate instead enforces the durable boundary:

```text
exercise case copied into production:       false
EXERCISE-UC-1345 admitted as a real target: false
production cases must validate as real:     true
controlled exercise counts as demand:       false
controlled exercise has canonical power:   false
```

## Global one-cycle and roadmap custody

The checker reads `data/WATERLINE.json`, `data/WATERLINE-STATE.json`, and the complete Autopilot queue. It requires:

```text
one_cycle_at_a_time:              true
Doctor Who max tasks per cycle:   1
global active jobs at drill:      0
open/unreviewed waterline cycles: 0
Doctor Who queue:                 316 total / 315 queued / 1 resolved / 0 in flight
```

It also reads `data/ROADMAP.json` and `data/ROADMAP-STATE.json`. The correction drill is not allowed to close `adapter-sdk-and-second-gold-shard`; completion requires a separate reviewed transaction with second-desk authority.

## Durable files

```text
data/review/corrections/controlled-exercise-002-doctor-who.json
data/review/adapter-sdk/doctor-who-correction-drill-001.json
scripts/doctor-who-correction-drill.mjs
```

The generic correction schema and validator remain authoritative. The Doctor Who checker composes them with the pilot receipt, exact canonical row, exact media facets, certified task/source receipts, preservation snapshot, live production correction ledger, global Autopilot state, waterline policy/state, and roadmap definition/state.

Run:

```bash
npm run doctor-who:correction-drill:check
```

The canonical repository gate runs this command through `autopilot:fixtures`. No workflow is added.
