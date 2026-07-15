# DS9 maker attribution — pinned receipts, owner-attached credits

This lane answers “who built the designed face?” without letting a machine turn a
page match into an attribution. The fan-out produced 47 Memory Alpha excerpts.
The collector pins and verifies those excerpts as **receipts**. It may show exact
character/species joins as triage signals, but signals are not evidence that a
maker worked on a specific performance.

```text
CONTACT=you@example.com npm run ds9:maker:adjudicate  # network: pin receipts
npm run ds9:maker:queue                               # offline: owner queue
npm run ds9:maker:fixtures                            # offline: contract
```

## The boundary

- Machines **collect, pin, hash, verify, and surface signals**.
- Machines do **not** set `substantive`, infer applicability from regexes, or
  broadcast character/species claims into performance credits.
- Only `maker-decisions.json` attaches credits to a canonical `duplicate_key`.
- Credits are **plural and typed**. A designer, sculptor, applicator, supervisor,
  shop, and credited department may all deserve separate credit.
- A non-empty credit list does not imply completeness. The owner explicitly marks
  each review `partial` or `complete`.
- Nothing in this lane enters `specimens.json`; GROW.md remains the ingestion gate.

## Evidence and signals

`maker-evidence.json` stores each raw claim once as a full-SHA-256 content-addressed
receipt. The address covers the reader assertion, exact quote, canonical page URL,
pinned revision, and page-content hash. Changing a quote, reader assertion, or
snapshot changes the id.

`signals.possible_duplicate_keys` are convenience joins only. They may include
both actresses for Cretak or every Ferengi for a species-design note. Aggregate
pronoun pages (“Unnamed … residents”, “his makeup artist”) intentionally signal
zero performances. No signal can satisfy owner-decision validation.

## Owner decisions

Each owner credit records maker identity and entity type; credited work category
plus the source's exact wording; `performance` or `design_lineage` scope; pinned
receipt supports; exact maker, target, and production spans; and an applicability
rationale. Each decision also records review coverage (`partial` or `complete`),
owner, date, and an immutable GROW.md policy pin.

Direct support must explicitly bind the quote to DS9 (or a known DS9 episode) and
the canonical performance. A recast character requires the performer to be named.
Design-lineage support additionally requires a separate pinned bridge proving that
the cited character/species design applies to this DS9 performance.

This prevents the known failures:

- TNG Alexander makeup cannot credit Marc Worden's DS9 Alexander;
- a Season 4 Ziyal note cannot silently credit Melanie Smith;
- Picard Romulan design cannot credit DS9 Cretak;
- aggregate pronouns cannot attach to every background performer;
- rejected prototypes, alternate forms, body parts, and speaker job titles remain
  receipts for owner review rather than machine-issued credits.

## Files

| file | authority | purpose |
| --- | --- | --- |
| `maker-judgments.json` | fan-out input | 47 raw reader claims, preserved |
| `maker-evidence.json` | machine | pinned receipts + non-authoritative signals |
| `maker-decisions.json` | **owner** | the only performance-credit attachments |
| `maker-queue.json` | machine | 557 review/partial/complete projections |
| `maker-summary.json` | machine | receipt and queue counts |
