# UNDERCAST crawler contract

Start at [`data/archive.json`](data/archive.json). It is the versioned machine
contract and names every canonical file, schema, projection, route, checksum and
policy. Discover public pages through `robots.txt` and `sitemap.xml`.

## Truth and projections

- `data/specimens.json` and `data/SOURCES.json` are canonical truth.
- `data/index.json`, `data/shards/`, `data/entities.json`, `data/search/` and the
  permanent HTML record routes are generated projections. They are disposable.
- Verify the SHA-256 values in `data/archive.json` before treating a cached
  projection as current.
- `data/entities.json` groups exact credit labels for navigation. Its keys are
  stable derived keys, not assertions that two similarly named humans are the
  same legal identity.

## Evidence rules

- Never invent or infer a performer, role, maker, image, production condition or
  identity link.
- `conditions[]` is allowed only when its note is supported by its own `source`.
- Missing, disputed and unknown evidence must remain missing, disputed or unknown.
- Image origin and license fields describe provenance; they do not transfer rights.

## Durable identifiers

- Specimen IDs match `^UC-G?\d+$` and are never reused.
- Permanent record: `/undercast/records/{id}/`
- Interactive record: `/undercast/recognition.html#{id}`
- Wall record: `/undercast/index.html#{id}`

## Polite use

The public projections are static and may be cached. Prefer the lean index,
search shards and record shards over repeatedly downloading canonical truth.
When following outbound provenance links, obey the source site's robots policy,
rate limits and licensing terms. Cache successful responses and identify your
crawler honestly.
