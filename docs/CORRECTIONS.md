# Correction intake and public history

UNDERCAST treats correction as a first-class archival transaction. A report identifies one bounded record, field, image, source, or presentation problem. It does not directly write canonical truth. Intake, privacy screening, evidence review, disposition, canonical application where separately authorized, and public history remain distinct responsibilities.

## Public intake

The repository issue form at `.github/ISSUE_TEMPLATE/correction.yml` accepts an exact record identifier, correction type, current problem, proposed correction, and public evidence. The form refuses private correspondence and sensitive personal information. A submitted issue is a review request, not an automatic canonical change.

A production case enters `data/CORRECTIONS.json` only after privacy screening. An empty ledger means no real case has been admitted. It does not mean the archive is error-free, that public demand is zero, or that response time is zero days.

## Case lifecycle

```text
intake
→ triaged
→ evidence-reviewed
→ dispositioned
→ history-published
```

The reporter cannot review or adjudicate the same case. A terminal disposition requires second-desk or owner authority. Accepted, rejected, insufficient-evidence, withdrawn, and still-pending states remain distinguishable. Evidence values are hash-bound, events are chronological, and public-history claims require an actual history event.

Canonical application remains a separate transaction. The correction ledger preserves the claim and disposition, but does not acquire authority over `data/specimens.json`, `data/SOURCES.json`, media files, maker credits, or generated public routes.

## Controlled exercise

`data/review/corrections/controlled-exercise-001.json` is a synthetic end-to-end proof. It uses an `EXERCISE-` target, public-only synthetic evidence, independent review, second-desk disposition, and a public repository history. Its accepted outcome demonstrates the mechanism. It cannot mutate a canonical record, count as public demand, populate a real correction metric, or complete the roadmap milestone.

This exercise removes a dependency on strangers. The archive can qualify its intake, custody, review, and history machinery using existing information before a real report arrives. When a real report does arrive, the same validator applies and the production ledger immediately supplies the observed denominator.

## Commands

```text
npm run corrections:write
npm run corrections:check
npm run corrections:status
npm run corrections:fixtures
```

The write command deterministically records the current baseline under `data/review/corrections/BASELINE.json`. The check command refuses stale bytes. The status command computes the same object without changing the repository. The fixtures reject private data, evidence mutation, unknown evidence references, chronology drift, self-review, self-adjudication, missing public history, weak disposition authority, exercise mutation, target laundering, and false zero-valued metrics.

## Measurement boundary

Real correction metrics are observation-triggered:

```text
no admitted real cases
→ null response and close-time metrics

first admitted real case
→ observed denominator exists
→ measurement and service-level review become due
```

No empty inbox becomes a zero-day response. No controlled exercise becomes public demand. No accepted report becomes a canonical correction until the separately authorized change passes the complete repository and rendered-browser gate.
