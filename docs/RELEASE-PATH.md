# Deterministic build and Pages release

`npm run build` verifies the admitted archive snapshot and compiles `.ci/site`.
It reads the current contract, owning media declarations and canonical records;
it does not retrieve, consult a model, use credentials, or rewrite source data.
The existing record generator runs in a disposable isolated staging directory.
Text payloads are UTF-8 with LF endings. `.ci/build-identity.json` contains the
sorted input, media and payload SHA-256 manifests. It is **not a gate receipt**.
Use a fresh output directory: an existing `.ci/site` causes the build to refuse
replacement. `npm run publication:fixtures` tests repeatability in fresh isolated
directories and restores inputs using the existing preservation manifest format.

Projection refresh remains the existing explicit offline operation,
`node scripts/shard.mjs`. Review its source/projection changes; ordinary compilation
fails on stale contract hashes rather than silently accepting different truth.
`npm run retrieve` remains explicit networked intake; credits and all acquisition
workflows retain their existing commands. Intake completion is not publication
validation.

## Publication inventory

`scripts/publication.mjs` inventories `data/archive.json`, its exact admitted
canonical/projection/schema/web paths, shard and search manifests, discovery
resources, and the static pages' dependencies. Its policy allowlist prevents an
extra contract row from granting publication to an arbitrary file. There is no
second corpus schema or projection index.

The artifact includes the five existing root HTML surfaces, live and retired
permanent records, crawler resources, referenced styles/scripts/placeholders,
17 publicly cited card-backfill manifests, UC-116's cited Granny source text,
and the quality-baseline receipt's five-file receipt/ledger closure. Static links
and sitemap identities are checked. The sitemap preserves the existing rule:
live and removed IDs are listed; merged aliases still have permanent routes.
Embedded historical `artifact_path`, `original.path`, and `preserved_path` values
are descriptions of historical custody, not authorization to publish originals,
render bands, recovery bags or superseded images.

The homepage's accepted `Fraunces` and `Space Mono` families are self-hosted from
nine content-addressed WOFF2 subsets. `assets/fonts/SOURCES.json` binds each byte
to its upstream URL, SHA-256, size, unmodified transformation state and immutable
Google Fonts license revision; both SIL Open Font License texts ship with the
artifact. The build validates the exact ledger and local CSS reference set. It
performs no font retrieval and the homepage CSP permits fonts only from self.

Only current canonical local media with exact audit byte/hash receipts is copied.
Release media retains the declared GitHub URL and SHA-256/size identity; local
release mirrors are checked if present and otherwise omitted. The existing
homepage directly references two local Morn hero images, including its no-JS
fallback: these already-public static dependencies remain local, checked against
their media-manifest hashes. No external media is fetched or newly rehosted.
The rest of `data/review`, `data/review/clifford-number`, raw chats, private paths,
tests, dependencies, transient evidence and unreferenced assets are excluded.

Networked media intake separately enforces `data/MEDIA-REJECTIONS.json`. That
projection binds reviewed invalid objects to exact hashes and scoped source locators;
rejected rediscoveries receive attempt receipts but their bytes never enter the
candidate artifact. It is an intake/gate input, not authority to publish historical
rejected objects or their review evidence.

Paths must be normalized, contained and free of symlinks/hardlinks. Missing or
corrupt dependencies, unknown local media, unsafe imported URLs/content, private
evidence references, duplicate IDs and incorrect route sets fail closed. The
packager rejects input mutation during construction. Verification hashes exact
output bytes, so post-build CRLF conversion also fails.

## Release boundary

`npm run gate -- --release` requires an exact clean Git checkout. It captures the
commit, tree and deterministic inputs before the **complete** canonical gate,
checks them again, and produces `.ci/pages` only after every step passes.
It writes public `release.json` with commit/tree, input/media/payload digests and
the complete step list. The payload digest covers every payload file except this
self-referential receipt. `.ci/release-identity.json` retains the full manifests
and receipt digest; `.ci/release-run.json` separately records volatile run time
and workflow identity. Existing output directories are not silently reused.

`node scripts/gate.mjs --verify-release` rechecks checkout, inputs, manifests,
receipt, exact file set and bytes immediately before upload. `--from` and
`--skip-rendered` are diagnostic only and cannot create a release receipt. Their
success output explicitly says `diagnostic partial gate`.

Both CI and local runs use `scripts/gate.mjs`. Pages accepts only this repository's
trusted main ref. A successful acquisition `workflow_run` wakes validation of
main, resolved once at checkout; it never supplies code or artifacts to deploy.
The build job has `contents: read`, no persisted checkout credentials, and runs
the full gate. The deploy job has Pages/OIDC write permissions, no checkout and
no repository commands; it consumes the unique build artifact for that exact
workflow run and attempt. No compilation runs between verification and upload.
Pull-request code does not run under Pages write permissions.

The implementation follows the provider's separate-job
[upload-pages-artifact](https://github.com/actions/upload-pages-artifact)
and [deploy-pages](https://github.com/actions/deploy-pages) contracts. Direct
actions are pinned to the commit linked by these provider releases:
[checkout v4.2.2](https://github.com/actions/checkout/releases/tag/v4.2.2),
[setup-node v4.4.0](https://github.com/actions/setup-node/releases/tag/v4.4.0),
[upload-pages-artifact v3.0.1](https://github.com/actions/upload-pages-artifact/releases/tag/v3.0.1),
[deploy-pages v4.0.5](https://github.com/actions/deploy-pages/releases/tag/v4.0.5),
[upload-artifact v4.6.2](https://github.com/actions/upload-artifact/releases/tag/v4.6.2).

## Historical replay and online verification

The Star Trek historical runner propagates `historical-temp.cjs` through its Node
children. This preload maps only the sealed validator's literal
`/tmp/lwaxana-kukulkan-projection-` prefix to `os.tmpdir()`. Preserved script and
receipt bytes and all historical assertions remain unchanged. It creates no
`C:/tmp` and does not intercept Git, facts, file reads, or other prefixes.

External availability is a separate finite operation:
`node scripts/publication.mjs --verify-external OFFSET LIMIT` (limit 1–10).
Each entry has a 15-second deadline and at most three redirects to declared
GitHub asset hosts. Returned bytes are size/hash checked in memory and discarded.
An unavailable, denied or corrupt response is reported as unverified with a
nonzero exit; it does not change media facts or issue publication authority.
This online operation is not part of compilation or the canonical gate.

## Repeat checks

```text
npm run publication:fixtures
npm run gate
npm run star-trek:lwaxana-eligibility-rejection:check
npm run build
```

On PowerShell hosts whose script policy blocks `npm.ps1`, use `npm.cmd` without
changing execution policy. The release-producing command is for the controlling
session's integrated clean checkout: `npm run gate -- --release`. No local test
result replaces independent review, human UI inspection or release verification.
