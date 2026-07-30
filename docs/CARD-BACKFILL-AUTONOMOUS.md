# Autonomous card-backfill campaign

The campaign is not paced by chat turns. One GitHub Actions job repeatedly plans, discovers, adjudicates, stages, publishes, and advances the selector estate until it reaches a typed stop condition.

## Operating loop

```text
plan next shape-equivalent cohort (default 40)
        ↓
fan retrieval across four isolated shards
        ↓
merge and render deterministic per-card packets
        ↓
independent GitHub Models second desk
        ↓
retain every acceptance, rejection, miss, and quarantine receipt
        ↓
commit the cycle state
        ↓
publish at the target or at the final residual floor
        ↓
repeat without a chat continuation
```

The default run budget is twelve cycles of forty obligations, or 480 selection slots. That exceeds the frozen 472-member campaign and the current 430-item open denominator. A hosted run also has a 330-minute internal budget. Once the workflow exists on the default branch, a time-limited run may re-arm itself with `workflow_dispatch`; a four-hour schedule provides an additional recovery clock.

## Coverage layers

The planner first drains ordinary shape-equivalent cohorts using the existing source-family routes. When those cohorts are exhausted, it enters the bounded still frontier.

The bounded frontier promotes only obligations whose sole quarantine reason is `no-bounded-still-source-route`. It does not waive any identity, evidence, audit-risk, or source-ledger requirement. The promoted route is deliberately narrow:

- source host: English Wikipedia;
- exact character title first;
- production-scoped search fallback;
- at most eight search results;
- at most forty page image references;
- at most ten downloaded candidates;
- selected bytes cannot prove identity or role;
- independent adjudication remains mandatory;
- all ambiguity fails closed.

At the campaign freeze, all 177 quarantined obligations had exactly that single source-route reason, so the bounded layer turns the previous manual frontier into five routine source/render cohorts without weakening the evidentiary boundary.

## Independent machine second desk

Discovery cannot approve its own candidate. `scripts/card-backfill-machine-adjudicate.mjs` submits the deterministic evidence composite and separately typed source custody to GitHub Models.

Identity and presentation remain different claims:

- identity may pass only when textual source custody explicitly binds the selected file to the expected subject;
- appearance is never identity evidence;
- the image is used only to judge the required presentation (`neutral-human` or `character-depiction`);
- acceptance additionally requires the configured identity and presentation confidence thresholds;
- API failure, malformed output, ambiguous source binding, wrong presentation, or low confidence produces rejection or quarantine rather than publication.

Every decision retains prompt, response, and image digests, model identity, thresholds, evidence URLs, and the originating discovery batch.

## Publication economics

Accepted packets persist across discovery cohorts. The target permanent batch remains forty and the ceiling remains fifty. The floor is two so a low-yield final residual does not require another human turn. The complete repository gate runs only when permanent evidence is materialized, once per permanent batch.

Cycle commits contain only adjudication and staging state. Publication commits contain the exact permanent packet directories, the matching batch receipt, and the corresponding staging transition.

## Stop conditions

The job stops only for a typed reason:

- the current coverage pass is drained;
- the frozen denominator reaches completion;
- the time budget or cycle ceiling is reached and an unattended re-arm is attempted;
- a hard custody, model-contract, source-transport, duplicate, or repository-gate failure occurs.

A source miss does not stop unrelated obligations. It receives a retained attempt receipt and is excluded from duplicate work in the same pass. Residual misses are therefore a source-policy backlog, not a request for someone to press **Continue**.

## Commands

Run the complete loop locally or in a suitably authenticated runner:

```bash
npm run card-backfill:autonomous
```

Prove the two new machine surfaces without network transport:

```bash
npm run card-backfill:machine-adjudicate:fixtures
npm run card-backfill:bounded-open-web:fixtures
```

The repository workflow is `.github/workflows/card-backfill-autonomous.yml`.
