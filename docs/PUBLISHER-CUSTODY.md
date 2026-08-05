# Publisher custody

Issue [#418](../../issues/418) separates verification authority from repository mutation authority.

## Pull-request rule

A workflow whose executable definition is loaded from a `pull_request` head may verify, package, and upload evidence, but it may not receive any effective `write` permission. Omitted permissions are treated as unsafe repository-default authority rather than assumed read-only. The repository scanner fails on new PR-head writers, inherited write scopes, ambiguous write-job conditions, and stale exceptions.

The legacy exception denominator is now zero. `data/review/ci-publisher-custody-baseline.json` remains as a machine-readable assertion that no pull-request workflow has mutation authority.

## Trusted publication rule

Write-capable publication runs from a `workflow_run` definition loaded from the default branch. The publisher accepts only a successful exact-main push run and refuses publication unless current `main` still equals the evidence head.

The evidence producer creates a closed handoff containing the repository, run and attempt, event, branch, head SHA, artifact name, and SHA-256 of every retained input. The trusted publisher independently recovers the registered artifact metadata, verifies its ID, name, digest, source run and source head, downloads it, and rehashes every handoff file before generating a durable issue payload. It checks `main` again immediately before mutation.

Operational reliability and operational metrics use this split directly:

```text
pull_request / main push evidence job: contents read only
trusted workflow_run publisher:       contents read, actions read, issues write
```

## Product settlement rule

Before terminal settlement, a product publisher must re-fetch the actual pull request and verify its base ref, immutable base SHA, exact product head, deterministic one-parent tree and commit, one-commit count, draft/open/unmerged state, and exact changed-path manifest. The construction, PR-creation, receipt-creation, and terminal-closure checkpoints must all observe the same immutable `main` SHA. Publication receipts are canonicalized and SHA-256 bound; receipt tampering or any main advance fails closed.

## Commands

```text
node test/publisher-custody-fixtures.mjs
node scripts/publisher-custody.mjs check-workflows
node scripts/publisher-custody.mjs verify-evidence-handoff \
  --handoff-json /path/to/publisher-handoff.json \
  --artifact-json /path/to/artifact.json \
  --root /path/to/extracted-artifact \
  --kind <evidence-kind> \
  --repository <owner/repo> \
  --run-id <run> \
  --run-attempt <attempt> \
  --event-name push \
  --head-branch main \
  --head-sha <exact-main> \
  --artifact-id <artifact> \
  --artifact-name <name> \
  --artifact-digest <sha256:digest>
node scripts/publisher-custody.mjs verify-terminal-publication \
  --settlement-json /path/to/settlement.json \
  --pr-json /path/to/refetched-pr.json \
  --paths-json /path/to/authorized-paths.json \
  --current-main-sha <observed-main> \
  --verifier-run-id <run> \
  --carrier-head <carrier> \
  --artifact-id <artifact> \
  --artifact-digest <sha256:digest> \
  --base-ref main \
  --base-sha <immutable-parent> \
  --head-sha <exact-product> \
  --tree-sha <exact-tree> \
  --pr-number <number>
```

This control does not authorize source recapture, evidence admission, chronology resolution, class closure, product merge, external contact/review, or outside-human work.
