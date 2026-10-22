# Website profiles: first presentation boundary

## Status and authority

This is an isolated, reversible implementation of the owner's 2026-10-22 request
to start the website-configuration work following the headless-readiness audit.
It is a preview compiler over the existing archive, not a promoted redesign,
new reveal, write API, new database, or completed public-interface milestone.
DEC-0001, DEC-0005, DEC-0008, DEC-0010 and DEC-0012 remain in force. No canonical
record/schema, roadmap state, review state, collection lease, schedule or Pages
workflow is changed. The normal `build` and release commands remain unchanged.

## Working entrypoints

From a clean checkout with the existing exact dependencies installed:

```sh
npm run build:profile -- --profile config/sites/field-guide.json
npm run build:profile -- --profile config/sites/reading-room.json
```

The outputs are `.ci/profiles/field-guide` and `.ci/profiles/reading-room`.
Each output must be absent. `--out .ci/profiles/another-name` selects another
fresh preview; output outside `.ci/profiles` is refused. The example domains
end in `.invalid` and are not deployments. Serve each generated directory at the
path in its profile: `/` for field-guide and `/research/collection/` for
reading-room. The latter is deliberately nested to exercise relocation.

The compiler does not require a browser, model, credentials or network access.
It first runs the existing exact-input publication compiler, then applies a
closed set of settings to a disposable stage. It retains the existing card flip,
record generator, absence artwork, navigation controller and evidence renderer.
It publishes the output directory only after its checks pass.

## What a profile controls

`config/sites/*.json` uses a closed version-1 document:

| Setting | Boundary |
| --- | --- |
| `id` | A short lowercase profile identifier. |
| `base_url` | Normalized HTTPS origin plus trailing-slash directory; no credentials, port, query, fragment or encoded traversal. |
| `brand.name`, `brand.tagline` | Escaped plain text for the shared wordmark/tagline and page title. Canonical catalog identity and editorial record prose stay intact. |
| `navigation` | Labels and ordering for the same five existing destinations. Every destination remains present exactly once; record-context controls remain intact. |
| `layout.max_width` | 960–1600 pixels. |
| `layout.card_min_width` | 268–420 pixels, with a one-column small-screen fallback. |
| `layout.gap` | 16–32 pixels. |

Arbitrary HTML, JavaScript, CSS, URLs in navigation, alternative evidence policy,
verification overrides, hidden evidence, corpus filters and new destinations are
not settings. The approved Fraunces and Space Mono files are reused locally.
The preview stylesheet applies them across the existing surfaces while retaining
the shared palette. Light-first and saved-theme behavior remain unchanged.

The reading-room example changes branding, base path, navigation order/labels,
page width and card density using JSON alone. It deliberately presents larger
cards; it is not a second character-to-performer interaction.

## Evidence versus deployment metadata

Canonical records, source ledgers, citations, census, shards, media-review states,
media bytes, schema files, tombstones and historical receipts retain their exact
published bytes. The complete `<main>` of every generated permanent record also
retains its exact bytes. Compilation checks both properties.

`data/archive.json` is itself a generated descriptor and includes website hashes.
A profile therefore regenerates its deployment URL and web-asset hashes instead
of copying a descriptor that would falsely hash the old HTML. Its canonical,
projection, schema, identifier, policy and vocabulary entries remain identical.
The sitemap, dataset deployment URLs and static recovery paths follow the selected
base. Scripts and record evidence are not subjected to a global string replacement.

`website-profile.json` identifies the profile, original canonical archive URL,
source contract digest, source input/media/payload digests and preserved-payload
digest. It explicitly says `status: preview` and `release_authority: false`.
The output has no `release.json`, displays a preview notice, and requests no
indexing. Historical `release-1.0.json` remains source evidence, not a new release.
The production `og.png` is retained byte-for-byte but not advertised by preview
social metadata: its old embedded count requires a separate production correction.

The ordinary publication allowlist excludes profile code, configuration,
review captures and generated preview outputs. The normal production payload
must remain unchanged by this work. No profile can bypass the release gate.

## Verification

`npm run profiles:fixtures` checks closed configuration, injection and path
refusals, navigation completeness, template-slot drift, source immutability,
contract coherence, build repetition, root/nested/same-host bases, release-output
isolation and default-build parity. It restores declared inputs into a disposable
snapshot and disables networking in both the fixture process and child builds.

`npm run test:profiles` exercises both compiled profiles in Chromium on desktop
and mobile: settings, grid density, shared fonts, keyboard flip and menu recovery,
image review/absence/offline distinctions, saved themes, voice records,
no-JavaScript permanent records, retired identifiers and deep-path recovery.
External image requests are stubbed in those behavior tests; that is not a media
identity or upstream-availability test. Separate visual-review captures use real
network requests and report failures rather than substituting images.

These two suites qualify the isolated preview explicitly. Under DEC-0008 they do
not become production gate invariants before promotion. The unchanged canonical
`npm run gate` separately checks production regressions. No release gate,
scheduled task or workflow is added.

## Remaining promotion boundary

The profile format configures the existing frontend. It does not yet select
arbitrary templates, languages, collection subsets, media hosts, public services
or independently managed sites. Production typography reconciliation, the stale
social card, a reviewed deployment policy for additional origins and broader
frontend configuration remain separate work. Profiles remain previews until the
actual renders and complete acceptance evidence support promotion under DEC-0008.
