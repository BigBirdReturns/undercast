# Clifford Number HR recurrence-and-reopen Wave 10

Wave 10 converts the Wave 09 response audit into a live, fail-closed monitoring object.

## Rule

> Closure is provisional until live implementation, repair, independent verification, recurrence review, and the missing affected population are observable. Silence, time, policy publication, or training completion cannot close the case.

## Six monitored sentinels

| Lane | Case | Lifecycle state | Next review |
|---|---|---|---|
| HRRM-01 | Chloe Olivia Moffat | `open_pending_inquest_no_closure` | 2026-09-01 |
| HRRM-02 | Amin Abdullah | `monitoring_self_reported_reform_verification_stale` | 2026-09-01 |
| HRRM-03 | Nicola Forster | `reopened_coroner_contradiction_of_prior_change` | 2026-09-30 |
| HRRM-04 | Wayne Brown | `open_response_publication_gap` | 2026-09-01 |
| HRRM-05 | Matthew Brierley | `open_multi_recipient_response_publication_gap` | 2026-09-01 |
| HRRM-06 | Rickie Poon | `reopened_explicit_recurrence` | 2026-09-01 |


## Monitor states

```
source_snapshot_fixed
response_due_date_fixed
response_publication_state_fixed
implementation_owner_fixed
live_process_change_evidence
independent_verification_evidence
worker_or_record_repair_evidence
recurrence_signal_checked
cross_case_same_mechanism_checked
affected_population_evidence
evidence_freshness_clock_set
reopen_trigger_set
next_review_date_set
closure_claim_bounded
```

## Hard refusals

- no closure by silence or elapsed time;
- no promotion of training, policy, or institutional self-report into independent verification;
- no promotion of staleness into proof of nonimplementation;
- mandatory reopen when a material mechanism recurs or an authoritative finding contradicts prior reform claims;
- no AI, legal, liability, culpability, or victim-character inference in the Chloe Moffat lane;
- no outside-human dependency for the next scheduled review.

All controls remain proposed and unadopted.
