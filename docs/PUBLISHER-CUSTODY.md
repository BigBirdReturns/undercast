# Publisher custody

Issue [#418](../../issues/418) separates verification authority from repository mutation authority.

## Pull-request rule

A workflow whose executable definition is loaded from a `pull_request` head may verify, package, and upload evidence, but it may not receive any effective `write` permission. Omitted permissions are treated as unsafe repository-default authority rather than assumed read-only. The repository scanner fails on new PR-head writers, inherited write scopes, ambiguous write-job conditions, and stale exceptions.

Workflow custody uses the locked `yaml@2.9.0` YAML 1.2 parser rather than line-oriented trigger recognition. Plain, quoted, escaped, spaced-separator, block, flow-style, and aliased event mappings therefore resolve through one structural model. Duplicate keys, parser warnings, malformed mappings, excessive alias expansion, unsupported trigger shapes, and unsupported permission shapes fail closed. The separately retained OR-condition guard on canonical `main` may execute in a deliberately sparse environment; there it uses a conservative block-mapping fallback, while the authoritative focused and complete gates always install and exercise the locked YAML parser.

The legacy exception denominator is now zero. `data/review/ci-publisher-custody-baseline.json` remains as a machine-readable assertion that no pull-request workflow has mutation authority.

## Trusted publication rule

Write-capable publication runs from a `workflow_run` definition loaded from the default branch. The publisher accepts only a successful exact-main push run and refuses publication unless current `main` still equals the evidence head.

The evidence producer creates a closed handoff containing the repository, run and attempt, event, branch, head SHA, artifact name, and SHA-256 of every retained input. Artifact identity is `prefix-<run-id>-attempt-<run-attempt>`, so a failed attempt and a successful rerun cannot publish under one mutable name.

The trusted publisher independently recovers the exact workflow-attempt record, requires that attempt to be a completed success for the expected event, branch, and head, and selects exactly one live artifact with the attempt-bound name. It verifies the artifact ID, name, digest, source run, source branch, and source head; downloads the selected immutable artifact-ID URL; verifies the downloaded ZIP against the registered SHA-256; and rehashes every closed handoff file before generating a durable issue payload. It checks `main` again immediately before mutation, between reopen and edit, and after mutation.

Operational reliability and operational metrics use this split directly:

```text
pull_request / main push evidence job: contents read only
trusted workflow_run publisher:       contents read, actions read, issues write
artifact identity:                    prefix-run-attempt
artifact recovery:                    exact attempt + immutable artifact ID
workflow parsing:                     locked YAML 1.2, duplicate-key fail closed
```

## Product settlement rule

Before terminal settlement, a product publisher must re-fetch both the actual pull request and the Git commit object at `pr.head.sha`. PR metadata binds the base ref/SHA, exact product head, one-commit count, draft/open/unmerged state, and exact changed-path manifest. The independent Git commit object must have exactly one parent equal to the frozen base SHA and a tree equal to the expected deterministic product tree; a one-commit PR whose actual commit was built on stale ancestry therefore fails closed even if its displayed base is current.

The construction, PR-creation, receipt-creation, and terminal-closure checkpoints must all observe the same immutable `main` SHA. Publication receipts are canonicalized and SHA-256 bound; receipt tampering, actual ancestry/tree drift, or any main advance fails closed.

A caller should recover the commit object directly from Git custody before invoking the validator, for example:

```text
gh api "/repos/${GITHUB_REPOSITORY}/git/commits/${PRODUCT_HEAD}" > product-commit.json
```

## Commands

```text
npm ci
node test/publisher-custody-fixtures.mjs
node test/publisher-condition-custody-fixtures.mjs
node scripts/publisher-artifact-attempt-fixtures.mjs
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
  --artifact-name <prefix-run-attempt-name> \
  --artifact-digest <sha256:digest>
node scripts/publisher-custody.mjs verify-terminal-publication \
  --settlement-json /path/to/settlement.json \
  --pr-json /path/to/refetched-pr.json \
  --commit-json /path/to/refetched-head-git-commit.json \
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
