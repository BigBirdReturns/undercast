# UNDERCAST crawler contract

Start at [`data/archive.json`](data/archive.json). It is the versioned machine
contract and names every canonical file, schema, projection, route, checksum and
policy. Discover public pages through `robots.txt` and `sitemap.xml`.

## Truth and projections

- `data/specimens.json`, `data/SOURCES.json`, `data/constellations.json` and
  `data/tombstones.json` are maintained truth: live records, image provenance,
  sourced connective evidence and retired-ID continuity.
- `data/index.json`, `data/shards/`, `data/entities.json`, `data/search/` and the
  permanent HTML record routes are generated projections. They are disposable.
- `data/CENSUS-COVERAGE.json` is the performer-plus-role coverage projection;
  `data/CENSUS-SUMMARY.json` declares its source scope and performance modes.
  A performer appearing elsewhere in the archive is not evidence that a
  different designed role is covered. `data/CENSUS-UNRESOLVED.json` retains
  character pages whose source names no performer instead of silently dropping them.
- `data/CENSUS-FERENGI-TEST.json` is the executable Ferengi benchmark report.
  `status: PASS` proves every named physical credit has an exact sourced
  constellation edge or evidence-backed exclusion; `accounting_status` proves
  every discovered row has a disposition. `wall_coverage_complete` separately
  states whether eligible filed card gaps remain.
  Never interpret accounting completeness as total licensed-media completeness.
- Verify the SHA-256 values in `data/archive.json` before treating a cached
  projection as current.
- `data/quality.json` publishes current completeness and claim-evidence coverage
  with non-regression floors; a gap remains a gap, not an inferred fact.
- `data/entities.json` groups exact credit labels for navigation. Its keys are
  stable derived keys, not assertions that two similarly named humans are the
  same legal identity.
- `data/constellations.json` is the broader evidence graph. Node IDs are durable
  typed anchors. Every edge is sourced. `scope: specimen` must name a matching
  live record; `scope: context` may connect a person or role without granting
  wall eligibility; `scope: structure` organizes works and franchises.

## Evidence rules

- Never invent or infer a performer, role, maker, image, production condition or
  identity link.
- `conditions[]` is allowed only when its note is supported by its own `source`.
- `references[]` ties performance, design, production, biography and interview
  claims to the source that actually supports them. A performer profile alone
  is not evidence for every claim on a card.
- Missing, disputed and unknown evidence must remain missing, disputed or unknown.
- Census zeroes are never inferred from an unavailable wiki. Community-wiki
  snapshots do not silently include uncredited extras or licensed works outside
  the named source; those boundaries remain explicit in the summary.
- Image origin and license fields describe provenance; they do not transfer rights.
- `still.focus` and `portrait.focus` are curated display coordinates, not claims
  about image content. They use semantic horizontal/vertical positions so every
  surface can preserve the same intended subject through responsive crops.

## Durable identifiers

- Specimen IDs match `^UC-G?\d+$` and are never reused.
- Merged duplicates remain in `data/tombstones.json`; clients resolve them
  through `shard-manifest.json.redirects` rather than treating them as missing.
- Permanent record: `/undercast/records/{id}/`
- Interactive record: `/undercast/recognition.html#{id}`
- Wall record: `/undercast/index.html#{id}`
- Constellation anchor: `/undercast/constellation.html?id={constellation_id}&node={node_id}`

## Polite use

The public projections are static and may be cached. Prefer the lean index,
search shards and record shards over repeatedly downloading canonical truth.
When following outbound provenance links, obey the source site's robots policy,
rate limits and licensing terms. Cache successful responses and identify your
crawler honestly.
