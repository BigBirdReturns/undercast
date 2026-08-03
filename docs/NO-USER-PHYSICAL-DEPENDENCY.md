# No user physical dependency

The project owner supplies direction through the conversation. The project must not convert that relationship into an execution dependency.

## Permanent rule

No roadmap milestone, Autopilot cycle, research lane, release, handoff, field-test route, or remediation may require the project owner to:

- run commands, install software, configure a machine, or operate a local environment;
- upload, download, move, transfer, attach, send, or sign an artifact;
- contact, recruit, invite, call, email, or locate an outside person;
- perform a manual test, visit a location, mail or ship an object, or actuate a physical system;
- provide an out-of-band acknowledgment that is then treated as evidence.

Owner authority and owner execution are different. A decision can define the ceiling for an irreversible act. It cannot make the owner the worker needed to reach that ceiling.

## Required fallback

```text
automatable repository or research work
→ execute now

public network evidence
→ retrieve and record it

missing physical or external evidence
→ mark the claim unproven
→ preserve the absence
→ continue all nondependent work

missing owner decision
→ use the best evidence-backed reversible default
→ continue reversible work
→ hold only the irreversible act that genuinely lacks authority
```

A physical operation, recipient acknowledgment, external review, or institutional adoption may remain unproven. That is an evidence boundary, not a task assignment to the owner.

## Decision custody without execution dependency

The roadmap has four distinct states:

```text
complete
→ reviewed completion receipt exists

ready
→ dependencies, triggers, and required decisions are present
→ full playbook is authorized within its stated authority

reversible
→ dependencies and triggers are present
→ an owner decision is absent
→ only the milestone-specific reversible work is authorized
→ held decisions and held actions remain forbidden

blocked
→ a dependency or measured trigger is absent
→ no milestone work is authorized
```

`data/EXECUTION-POLICY.json` carries the exact reversible work, held decisions, and held actions for every decision-bearing milestone. `roadmap next` returns both `ready` and `reversible` work and prints the applicable boundary. A missing owner decision therefore cannot remove all work from the queue, but the milestone still cannot be completed and no held action may be performed until the decision exists.

This distinction is fail-closed:

```text
reversible evidence, fixtures, prototypes, and analysis
≠ canonical promotion
≠ publication
≠ live enrollment
≠ institutional commitment
≠ milestone completion
```

## Claim ceiling

This rule does not let the project infer a physical event that was not observed. It requires the opposite:

```text
not observed
≠ failed owner chore

not observed
= unproven claim with adjacent work still available
```

The canonical validator binds this policy to every roadmap milestone, rejects milestone-denominator and authority drift, requires exact reversible and held boundaries for decision-bearing milestones, rejects any owner-execution flag, and refuses direct playbook instructions assigning local, physical, contact, transfer, movement, attachment, or manual-test work to the owner.
