# Doctor Who correction drill 001

This controlled exercise pays the correction-drill requirement for the first Doctor Who pilot without creating a real public report or changing the canonical record.

## Exact target

```text
base main:          ae699cdd24d62ab4c5e0c81722d7d688152c54e1
record:             UC-1345
performer:          Dan Starkey
role:               Commander (The Sontarans)
performance mode:   voice
source page:        Tardis Wiki 246488
source revision:    3330636
source SHA-256:      2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966
```

The preserved evidence identifies an unnamed Sontaran soldier designated “Commander” in Big Finish’s December 2016 audio drama *The Sontarans*. The subject is distinct from Commander Slite.

## Adverse correction

The drill submits one deliberately wrong combined identity-and-media claim:

```text
rename the role to Commander Slite
+
attach a generic Sontaran character image
```

The correction chain performs exact-target intake, privacy screening, independent source review, second-desk disposition, and repository-native public history. The terminal result is rejection.

A generic Sontaran image cannot prove the depicted subject is this audio-only Commander. A performer portrait also cannot substitute for the character still. Both current media facets remain explicitly absent.

## Permanent boundaries

```text
real correction case created:                   false
public correction demand counted:               false
canonical record mutated:                       false
Commander Slite conflation adopted:             false
generic Sontaran still adopted:                 false
performer portrait substituted for character:   false
second Doctor Who lease issued:                 false
roadmap milestone completed here:               false
```

The production correction ledger remains empty. Doctor Who remains 316 obligations: 315 queued, one resolved, and zero in flight.

## Durable files

```text
data/review/corrections/controlled-exercise-002-doctor-who.json
data/review/adapter-sdk/doctor-who-correction-drill-001.json
scripts/doctor-who-correction-drill.mjs
```

The generic correction schema and validator remain authoritative. The Doctor Who checker composes them with the exact pilot receipt, canonical specimen/source ledgers, media audit, production correction ledger, and Autopilot queue.

Run:

```bash
npm run doctor-who:correction-drill:check
```

The canonical repository gate runs this command through `autopilot:fixtures`.
