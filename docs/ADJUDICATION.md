# Sourced adjudication — the repeatable fan-out pattern

Several UNDERCAST questions can't be answered from structured data alone — they
need someone to *read the sources and judge* (is this relationship real? did this
performer vanish under a designed face? who built this face?). This is the
reusable pattern for doing that **so the answer can be audited**, not trusted on
faith. It has already been used twice; use it again the same way.

## The four steps

1. **Fan out — the judgment layer.** A workflow of reader-agents each take a batch
   of items, read the Memory Alpha pages, and return a structured judgment **plus
   a VERBATIM basis quote** copied from the page. Silence is not evidence: if the
   page doesn't affirmatively say it, the agent returns an empty basis and a
   `review` hint. Agents never infer from absence.
2. **Pin — the receipt.** `scripts/lib/adjudicate.mjs` → `pinPages()` fetches every
   cited page and records its `revision` id and `content_sha256`. The claim is now
   anchored to an immutable revision anyone can re-fetch.
3. **Verify — the check.** `verifyBasis(quote, wikitext)` confirms the agent's quote
   actually appears in the pinned revision (normalised for markup). A quote that
   doesn't verify is kept but flagged `verified:false` and never decides anything.
4. **Derive — the verdict.** An offline, deterministic engine reads only the
   verified, affirmative claims and **returns everything unsupported to `review`.**
   No verdict rests on species, membership, reputation, or the absence of a
   mention.

The result: every decided verdict carries `{page, revision, content_sha256, basis}`
— a receipt a skeptic can re-check by fetching the revision and finding the quote.

## The shared harness

`scripts/lib/adjudicate.mjs` is domain-agnostic:

- `pinPages(titles, {contact})` → `Map(title → {revision, content_sha256, wikitext, url, …})`
- `verifyBasis(quote, wikitext)` → boolean (quote present in the pinned page)
- `extractBasis(wikitext, patterns)` → a verified sentence (when you'd rather pull
  the basis deterministically than ask an agent — weaker, prefer agent quotes)
- `pinnedClaim(pin, basis, establishes)` → a `{page, revision, content_sha256, basis, verified}` claim

## Where it's used

- **Family relationships** (`data/ds9/graph/family-relations.curated.json`): a
  fan-out audited every reciprocally-corroborated family edge; refuted edges were
  removed, step/adoptive/surrogate tagged with sources.
- **Wall eligibility** (`data/ds9/eligibility*.json`): reader-agents return the
  transformation and a verbatim basis quote; `ds9-eligibility-adjudicate.mjs` pins
  and verifies; `ds9-eligibility.mjs` derives eligible/ineligible/review offline.

## Good candidates to fan out next

The same harness extends to any read-and-judge question, e.g.:

- **Designer / maker attribution** — who built each face (makeup/creature shop),
  with a quote from the production notes.
- **Performance conditions** — heat, restricted vision, full enclosure, stunt work
  — each condition quote-sourced (the schema already exists in `specimen.schema.json`).
- **Image provenance / licence** — confirm each still/portrait's source and licence
  against its origin page.
- **Cross-production identity** — a performer's other designed-face roles beyond DS9.

Each follows the same contract: fan out for judgments + verbatim quotes, pin,
verify, derive with unsupported → review. Nothing enters `specimens.json` without
passing the normal GROW.md drafting and evidence gate afterwards.
