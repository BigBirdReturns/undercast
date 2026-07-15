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
4. **Prepare — the queue, not the verdict.** An offline, deterministic builder
   assembles a per-performance evidence dossier keyed by the canonical
   `duplicate_key`. It does **not** decide. No regex, species rule, signal, or
   agent recommendation can move a performance out of `review` — a verdict comes
   **only** from the owner's decisions file (`data/ds9/eligibility-decisions.json`),
   where a human records `{verdict, rationale, cited evidence_ids, decided_by,
   date, grow_md_version}` against GROW.md. Everything the owner has not decided
   stays `review`. Machines collect, pin, hash, verify, and flag unambiguous
   signals (voice-only, bare-faced) as hints; owners judge.

The result: every dossier carries `{page, revision, content_sha256, basis}` for
each verified quote — a receipt a skeptic can re-check by fetching the revision
and finding the quote — and every owner verdict cites the specific evidence IDs it
rests on. A decision that cites no substantive (verified, pinned, non-species)
evidence, or whose metadata is incomplete, or that is duplicate/stale/dangling,
fails the build (and CI) via the shared validator in `scripts/lib/eligibility.mjs`.

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
  and verifies into per-performance dossiers; `ds9-eligibility-queue.mjs` assembles
  an offline review queue where every performance is `review` until the owner
  records a verdict in `eligibility-decisions.json`. The machine prepares
  decisions; it does not make them.
- **Maker / designer attribution** (`data/ds9/maker*.json`): reader-agents returned
  47 character/species-page excerpts. `ds9-maker-adjudicate.mjs` pins each excerpt
  once as a content-addressed receipt and surfaces possible roster joins only as
  non-authoritative signals. It does not infer applicability or attach credits.
  The owner alone attaches plural typed credits in `maker-decisions.json`, citing
  exact maker/work/target/production spans, an applicability rationale, review
  coverage (`partial`/`complete`), and an immutable GROW.md pin. Design-lineage
  credits require a separate pinned bridge to the DS9 performance. See
  `data/ds9/MAKER.md`.

## Good candidates to fan out next

The same harness extends to any read-and-judge question, e.g.:

- **Performance conditions** — heat, restricted vision, full enclosure, stunt work
  — each condition quote-sourced (the schema already exists in `specimen.schema.json`).
- **Image provenance / licence** — confirm each still/portrait's source and licence
  against its origin page.
- **Cross-production identity** — a performer's other designed-face roles beyond DS9.

Each follows the same contract: fan out for judgments + verbatim quotes, pin,
verify, and **prepare** an evidence dossier — the machine never issues the verdict.
Anything that is an editorial call (does this satisfy the entry threshold?) is
left to a human decision file with cited evidence IDs; everything undecided stays
`review`. Nothing enters `specimens.json` without passing the normal GROW.md
drafting and evidence gate afterwards.
