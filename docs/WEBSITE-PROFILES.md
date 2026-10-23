# Website configuration

## Production

`config/sites/production.json` controls the released website's shared name,
tagline, order and labels of its five existing primary destinations, maximum
page width, minimum card width and spacing. `npm run build` applies that profile
through the existing offline publication compiler. Source HTML is the retained
base template, not an assertion that its unconfigured bytes are the deployment.
The browser test server builds and serves the configured artifact.

```sh
npm ci
npm run build
# Output: .ci/site (must be absent before the command).
npm run gate -- --release
# Full release acceptance, clean checkout required; output: .ci/pages.
```

The production base must remain the admitted canonical GitHub Pages URL.
An altered origin cannot silently take over the existing deployment. Only the
complete release gate issues a `release.json`; `website-profile.json` documents
configuration and input identity but grants no release authority.

## Alternate views

```sh
npm run build:profile -- --profile config/sites/field-guide.json
npm run build:profile -- --profile config/sites/reading-room.json
```

Outputs are `.ci/profiles/field-guide` and `.ci/profiles/reading-room`. Each must
be absent; `--out .ci/profiles/another-name` selects a fresh isolated location.
The examples use `.invalid` origins and are not public deployments. Mount the
first at `/` and the second at `/research/collection/`, as their profiles specify.
Both retain all 1,368 records and the two retired routes. Source changes never
occur during either compilation. The same pure renderer configures production
and these alternates; no forked application or duplicated archive is maintained.

Alternates explicitly display a preview notice, request no indexing and carry no
release receipt. Their static discovery URLs and recovery paths follow the chosen
base. Their social metadata does not impersonate the canonical site. The normal
production deployment remains independently gated.

## Closed settings

| Setting | Contract |
| --- | --- |
| `version`, `id` | Version 1; short lowercase identifier. |
| `base_url` | Normalized HTTPS directory, trailing slash, no credentials, port, query, fragment or encoded traversal. |
| `brand.name`, `brand.tagline` | Escaped plain text, maximum 40/120 characters. Editorial record prose and canonical catalog identity stay intact. |
| `navigation` | Labels/order of browse, recognition, coverage, makers and about; all exactly once. Existing record-context controls remain. |
| `layout.max_width` | Integer 960–1600 pixels. |
| `layout.card_min_width` | Integer 268–420 pixels, with small-screen reflow. |
| `layout.gap` | Integer 16–32 pixels. |

Unknown keys, injected markup, custom code, arbitrary navigation URLs, evidence
policy overrides and hidden destinations are rejected. Shared palette and approved
local fonts remain in their existing assets. Light-first and saved-choice behavior
remain unchanged. The format configures this frontend; it is not a general-purpose
template engine, write API or permission to change corpus membership.

## Evidence boundary

Canonical records, sources, claims, census, shards, image-review states, image
bytes, schemas, tombstones and historical release receipts remain byte-identical.
The complete `<main>` of every generated permanent record remains identical before
and after applying a profile. Runtime scripts are shielded from text replacement.

`data/archive.json` contains web hashes and is regenerated to describe actual
configured HTML. Its canonical, projection, schema, identifier, policy, vocabulary
and route entries retain their original meaning and bytes. Sitemap/dataset URLs
follow the deployment base. The compiled `website-profile.json` binds settings,
source archive digest, input/media digests and the preserved-payload digest.

The release manifest includes the production configuration and shared renderer as
private build inputs. They do not grant new public filesystem paths. Preview
compilation cannot overwrite source files, production build directories or any
existing output. Build repetition is byte-exact and needs no browser, model,
network, credentials or running database.

## Artwork and typography

The configured stylesheet applies Fraunces to display headings and Space Mono to
shared archival labels/wordmark across every page. It consumes canonical palette
tokens and the retained, verified font subsets; builds retrieve no fonts.

`og.png` is a count-independent 1200×630 rendering of
`assets/social-preview.html`. Its retained source/output identity is checked by
`assets/social-preview.json`. The template uses the same generic casting relief
as the missing-image plate, not a fabricated specimen photograph.

```sh
node scripts/build-social-preview.mjs --check
# Explicit artwork editing only, using installed Playwright Chromium, offline:
node scripts/build-social-preview.mjs --write
```

Ordinary compilation verifies the retained artwork and its source dependencies;
it does not launch a browser or rewrite it. A new renderer run requires visual
review and a committed updated receipt.

## Acceptance and authority

DEC-0017 records the owner's completion instruction and its boundaries. The
canonical gate includes `profiles:fixtures` and `test:profiles`: offline restored
builds; root, nested and same-host bases; deterministic repeats; source/evidence
parity; malformed configuration and template drift; symlink/overwrite refusal;
production isolation; desktop/mobile fonts, keyboard flip/menu behavior, stable
performer name, themes, missing/unverified/offline states, voice records,
no-JavaScript records, tombstones and deep-path recovery.

Behavior tests substitute remote images and therefore do not prove upstream
availability. Separate real-network captures verify the actual displayed site.
Visual baselines reflect reviewed configured output. Public deployment remains a
separate observed state after local tests, hosted CI and merge.
