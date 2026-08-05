# Publisher custody

Issue [#418](../../issues/418) separates verification authority from repository mutation authority.

## Rule

A workflow whose executable definition is loaded from a `pull_request` head may verify, package, and upload evidence, but it may not receive any effective `write` permission. Omitted permissions are treated as unsafe repository-default authority rather than assumed read-only. Publication must execute from a trusted workflow definition on `main`, a `pull_request_target` workflow that never executes untrusted head code, or an independently pinned Git blob whose exact content is verified before use.

Before terminal settlement, a publisher must re-fetch the actual product pull request and verify its base ref, exact base SHA, exact product head, one-commit count, draft/open/unmerged state, and exact changed-path manifest.

## Non-regression floor

`data/review/ci-publisher-custody-baseline.json` records the exact Git blobs of three legacy workflows that still combine PR verification with write authority. The baseline is not approval:

- changing any legacy blob without removing the unsafe authority fails;
- adding any new PR-head writer fails;
- removing a legacy violation without deleting its exception fails.

The issue remains open until the exception count reaches zero and write-capable publication runs only from trusted workflow custody.

## Commands

```text
node test/publisher-custody-fixtures.mjs
node scripts/publisher-custody.mjs check-workflows
node scripts/publisher-custody.mjs verify-product-pr \
  --pr-json /path/to/pr.json \
  --paths-json /path/to/paths.json \
  --base-ref main \
  --base-sha <immutable-parent> \
  --head-sha <exact-product>
```

This control does not authorize source recapture, evidence admission, chronology resolution, class closure, product merge, external contact/review, or outside-human work.
