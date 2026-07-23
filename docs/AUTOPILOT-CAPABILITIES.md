# Autopilot capability profiles

A durable queue is not useful when it repeatedly leases work the current review pool cannot actually complete. Capability profiles prevent that failure without changing eligibility, priority, or task state.

The capability layer answers one narrow question:

```text
Can this declared, reviewed worker pool perform every evidence operation this task may require?
```

It does **not** answer whether a role belongs on the wall. Incompatible tasks remain queued with their original priority and zero additional attempts. They are not rejected, blocked, resolved, retired, or hidden from status accounting.

## Canonical policy

`data/AUTOPILOT-CAPABILITIES.json` contains four reviewed namespaces:

- `capabilities` — named optional modalities, currently `audio-listening`;
- `profiles` — reviewed declarations of what a worker pool can actually do;
- `rules` — conservative requirements derived from task metadata;
- `task_overrides` — exact, source-fingerprint-bound corrections when a census mode hint is wrong or incomplete.

Every profile, rule, and override carries second-desk or owner review metadata. The whole policy is hashed into each lease packet and journal event.

A profile name is not proof of capability. `audio-vision` remains paused until at least three genuinely audio-capable independent blind reviewers are available and a reviewed policy change activates the profile.

## Current profiles

### `text-vision`

Active. The pool can research text evidence and inspect images, but cannot hear audio. It may lease capability-compatible physical tasks. Voice-mode tasks and exact reviewed voice overrides are skipped.

### `audio-vision`

Paused. It adds `audio-listening`. Activation requires a reviewed policy change; a caller cannot self-declare the capability at the command line.

## Inspect before leasing

```bash
npm run autopilot -- candidates \
  --scope star-trek \
  --capability-profile text-vision \
  --limit 20
```

Use `--json` for a machine-readable report. The report separates:

- compatible queued tasks, in unchanged deterministic priority order;
- incompatible queued tasks with required and missing capabilities;
- stale task overrides that require another source review.

The command is read-only. It does not consume an attempt or modify queue state.

## Lease the highest-priority compatible work

```bash
npm run autopilot -- next \
  --agent luna \
  --scope star-trek \
  --capability-profile text-vision \
  --limit 8 \
  --out .luna/batch.json \
  --prompt .luna/PROMPT.md
```

The normal strategy is `priority-compatible`: filter out tasks the reviewed profile cannot complete, then preserve the existing priority and lexical ordering among the remaining tasks.

Every lease records:

- capability profile ID;
- capability-policy SHA-256;
- profile capabilities;
- each task's required capabilities and reviewed requirement basis;
- selection strategy and basis.

Submission rejects a packet whose capability selection no longer matches the persisted lease.

## Reviewed exact-task selection

A proof cycle may select one lower-ranked compatible task after a reviewer has inspected the candidate report and source readiness:

```bash
npm run autopilot -- next \
  --agent luna \
  --scope star-trek \
  --capability-profile text-vision \
  --task-id ap_... \
  --limit 1 \
  --selection-basis "Capability-compatible physical proof task with exact source readiness reviewed for the restart-safe cycle" \
  --out .luna/batch.json \
  --prompt .luna/PROMPT.md
```

`--task-id` requires `--limit 1` and a specific selection basis. The exact task must still be queued, in the requested scope, and compatible with the active profile. This path is an auditable operating choice, not permission to erase or reprioritize skipped debt.

## Fail-closed behavior

- A paused or unknown profile cannot lease.
- A capability named by a rule or profile must exist in the registry.
- A task override is bound to the exact task ID and source fingerprint.
- When that fingerprint changes, the override becomes `stale-task-capability-review`; the task is incompatible under every profile until reviewed again.
- `--allow-inflight` does not bypass capability policy or the rolling waterline.
- Missing capability never becomes an eligibility rejection.
- A runtime that cannot hear must not activate or impersonate the audio profile.

## Current Star Trek correction

The Sargon task is source-reviewed as a disembodied James Doohan voice even though its current census mode hint says `physical-prosthetic`. The exact task override therefore requires `audio-listening` and is pinned to its current source fingerprint. The policy also conservatively requires audio for `voice-animation` and `physical-and-voice` mode hints.

This change prevents the Enwright/M-5 failure pattern from repeating while preserving those tasks as visible queue debt for an actually capable review pool.
