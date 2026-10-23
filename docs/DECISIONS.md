# UNDERCAST — Decision Log

Append-only. Every architectural or design decision about the **experience** lives
here as a numbered entry. Never edit a decision to change its meaning; to change
one, add a new entry that **Supersedes** it and mark the old one **Superseded**.

UI/UX pull requests must cite the decision number(s) they serve or change
(`docs/UI-REVIEW-CHECKLIST.md`). A change that contradicts an **Active** decision
without superseding it is out of bounds.

**Status values:**

- **Active** — ratified and **true of the repository now.** Binding.
- **Accepted; implementation pending (#NN)** — ratified *direction*; the repo does
  **not yet match it**; the named PR/work implements it. Do not cite as current state.
- **Proposed** — drafted, awaiting a ruling. Not binding.

A decision must never describe repository state falsely.

**Provenance:** entries below were **ratified through delegated product/design
review, 2026-07-13**, per the owner's decision slate on PR #44. Synthesized wording
is *not* an owner quotation; nothing here is presented as a verbatim owner statement.

---

## DEC-0001 — The flip is the signature character→performer reveal
**Status:** Active · Ratified through delegated product/design review, 2026-07-13

The flip is UNDERCAST's signature **character-to-performer** reveal. It presents
**one unsplit frame at a time** (the cards crop with `object-fit: cover`; "unsplit"
means the two faces are never composited into a single frame). This rule governs
that reveal; it does **not** prohibit maps, graphs, carousels, or other interaction
patterns elsewhere.

> **STOP.** No *second* mechanic for the **character→performer** reveal (seam,
> before/after slider, dissolve, wipe, morph) without a decision that supersedes
> DEC-0001.

---

## DEC-0002 — Retire the seam comparison mechanic
**Status:** Active · Implemented by #42, merged 2026-07-14

The "Compare in one frame" seam is retired. It composited two half-faces into one
frame and no longer exists in the shipped site or validation contract.

**Repo state:** #42 removed the seam from Recognition and removed `comparison`
from schema, data, validation, documentation, and rendered tests.

---

## DEC-0003 — Recognition keeps the focused record; loses the seam
**Status:** Active · Implemented by #42, merged 2026-07-14

Recognition keeps the focused record and no longer contains the comparison seam.
`focus` is retained; `comparison` is removed from schema, data, validation,
documentation, and tests.

**Repo state:** implemented on `main` by #42.

---

## DEC-0004 — Search is primary discovery
**Status:** Active (principle level) · Ratified through delegated product/design review, 2026-07-13

Search is a **primary discovery tool, not footer utility.** The homepage must
expose it in the **initial discovery area** and use **fan vocabulary** (character,
performer, production). Exact wording, dimensions, and placement remain
**implementation choices subject to visual QA** — the copy "Who are you trying to
place?" is one such choice, not part of this decision.

---

## DEC-0005 — The default opening is character-first; hero-scale performer is allowed after the flip
**Status:** Active and resolved · Ratified through delegated product/design review, 2026-07-13

The homepage opens **character/artwork first** and must **not be visually dominated
by performer photography.** A performer image appears **only after deliberate
visitor action.** After that action, the performer **may** occupy the same card
footprint — **including hero scale** — because continuity of the flipped object is
part of the reveal.

Therefore **#43 is acceptable on this principle** *if* its default face is
character-first; its composition and crop are judged **separately, in visual
review**, not here.

---

## DEC-0006 — Page ownership
**Status:** Active · Ratified through delegated product/design review, 2026-07-13

- **The wall (`index.html`)** owns **discovery and the first optional reveal.**
- **Recognition (`recognition.html`)** owns **depth and evidence.**
- **Permanent routes (`records/UC-…/`)** own **durable, linkable, no-JavaScript records.**
- **Coverage** owns **completeness and gaps.**
- **Constellations** owns **curated relationships.**

The record does not monopolize "the person" — see DEC-0007.

---

## DEC-0007 — The wall card may reveal the performer
**Status:** Active · Ratified through delegated product/design review, 2026-07-13

A wall card may reveal the performer **after an intentional flip.** The card's
initial state is character-first; the record does not monopolize performer identity.

---

## DEC-0008 — Permanence bar for visual experiments
**Status:** Active · Ratified through delegated product/design review, 2026-07-13

A visual experiment stays **isolated and non-canonical** until it is **all seven** of:

1. **Corpus-scalable** — works across representative records, not one specimen.
2. **Data-driven** — solves a documented, recurring need.
3. **Accessible** — keyboard, focus, alt text, contrast, targets.
4. **Responsive** — desktop and mobile.
5. **No-JS coherent** — degrades honestly with scripting off.
6. **Provenance-safe** — adds **no** schema or archive-contract fields while experimental.
7. **Maintainable** — reuses the existing reveal primitive (DEC-0001) or explicitly
   proposes superseding it.

Promotion also requires the owner to review actual desktop/mobile renders, the
complete gate to pass, and an explicit promoting entry in this log. Until then it
gets no schema, no validator invariant, and is not called a primitive.

---

## DEC-0009 — Constellations has not earned permanent top-navigation
**Status:** Active · Implemented 2026-07-14

Constellations stays **contextual** (under Explore or within records) and does
**not** occupy permanent top-navigation until it demonstrates **repeatable visitor
value** and **enough curated coverage** to justify a global destination. **No
arbitrary numeric threshold is constitutional** — the bar is demonstrated value, not
a count.

**Repo state:** Constellations is absent from the permanent Archive navigation and
remains available through contextual links on Recognition, Coverage, and permanent
records. The constellation route remains a valid curated destination.

---

## DEC-0010 — Shared CSS is canonical for tokens; typography changes only by decision
**Status:** Active (authority) · Ratified through delegated product/design review, 2026-07-13

**Shared CSS is canonical for actual token values.** Documentation describes intent
and may show current values but must not become a second source of truth.
Page-specific layouts are legitimate. **Typography may change only through an
explicit design decision, not incidental substitution.**

**Repo state:** implemented by PR #62, merged 2026-07-22. Shared token values now
live in `assets/site-tokens.css`; page-specific layouts and theme overrides remain
local without becoming competing token sources.

---

## DEC-0011 — `npm run gate` is the canonical repository gate
**Status:** Active (authority) · Implemented by PR #63, 2026-07-22

**`npm run gate` is the canonical repository gate.** `.github/workflows/validate.yml`
installs the runtime and invokes that single command. The workflow, checklists, and
operator docs must not maintain a second command list; new canonical checks belong
in `scripts/gate.mjs` and its adversarial fixtures.

## DEC-0012 — Collection-only operations are the default state

**Status:** Active · Ratified by owner direction, 2026-07-24

The v1 public experience and record contract are frozen by default. Normal work adds
verified records, improves evidence or media, refreshes preserved sources, corrects
errors, and advances new IP estates through reviewed adapters. A new public surface,
reveal mechanic, schema concept, account/service layer, or aesthetic system requires
an explicit superseding owner decision. Narrow correctness, rights, security,
accessibility and performance hotfixes remain permitted with an incident receipt and
a documented return to collection mode.

Legacy scheduled jobs may harvest leads or stage media candidates, but may not write
new canonical records or promote media directly. Canonical growth remains bounded by
Autopilot, exact-subject review, the rolling waterline and reviewed cycle receipts.

---

## DEC-0013 — Missing evidence and archive paths must be legible

**Status:** Active · Ratified by owner direction, 2026-07-24 · Implemented by #976, merged 2026-10-22

The frozen v1 product receives this bounded owner-approved correction:

- A missing character image or performer portrait must read as an intentional,
  high-contrast archive state, not as a faded, transparent or disabled card. The
  same information hierarchy applies in light and dark themes, and the copy must
  continue to say that evidence is not on file rather than implying a failed reveal.
- Light remains the deterministic first-load theme. A visitor-selected light or
  dark theme persists across Browse, Coverage, Connections, permanent records and
  recovery pages so the archive behaves as one product rather than isolated skins.
- The homepage must explain the distinct visitor question answered by Recognition,
  Coverage, Makers and Connections. Those destinations remain within the ownership
  boundaries in DEC-0006; Connections remains contextual rather than permanent
  top-navigation under DEC-0009.

This decision changes presentation and wayfinding only. It adds no schema concept,
reinterprets no unresolved credit as a finished card, and does not reopen general
product development under DEC-0012.

---

## DEC-0014 — Deterministic visual baselines and honest recovery are part of the frozen product contract

**Status:** Active · Ratified by owner direction in issue #242, implemented by #260, 2026-08-04

DEC-0012 remains the default operating rule. This decision authorizes one
bounded, corpus-disjoint product correction under the UX finishing program in
issue #242:

- Commit deterministic visual baselines for the five root surfaces and four
  exact permanent-record evidence states.
- Exercise index, canonical fallback, shard, constellation graph and cited-image
  failures across the supported desktop and mobile browser matrix.
- When both the generated index and canonical specimen fallback are unavailable,
  the wall may publish an honest failure state with an in-page Retry control.
  Retry must clear failed manifest, index, record and shard caches before booting
  again.
- A failed dependency must never authorize partial, stale or fabricated content.
  Recovery UI preserves the evidence boundary and source provenance.

The screenshots, browser fixtures and derived archive projection are regression
evidence, not a second corpus authority. This decision adds no public destination,
reveal mechanic, specimen field, schema concept, account layer or service. It does
not reopen general product development or relax collection-only corpus custody.

---

## DEC-0015 — Dense mobile evidence uses disclosure, not omission

**Status:** Active · Ratified by owner direction in issue #242, implemented by #262, 2026-08-04

DEC-0012 remains the default operating rule. This decision authorizes one bounded,
corpus-disjoint responsive correction under the UX finishing program in issue #242:

- Coverage retains its canonical accessible table and exact performer-role rows, but
  may project each row as a labelled card on narrow screens. Every field remains
  present; horizontal scrolling is not the primary mobile reading mode.
- The wall may collapse shelf, decade and sourced-species facets behind a native
  disclosure on narrow screens. An active deep-linked facet opens the disclosure and
  remains named; search, sort, counts and URL state are unchanged.
- Recognition may expose a mobile in-record section map. It must scroll within the
  current record without replacing the catalog-ID URL fragment or changing record
  identity.
- Constellation performer rows may collapse their Star Trek and elsewhere role stacks
  independently on narrow screens. A selected deep-linked edge opens its containing
  stack automatically, and the complete sourced edge ledger remains visible.
- Primary navigation and interactive controls on these mobile surfaces meet the
  established touch-target floor without changing desktop page ownership.

Disclosure changes presentation only. It may never discard a filed row, connection,
absence, credit, source, or uncertainty state, and it adds no destination, reveal
mechanic, specimen field, schema concept, account layer, or service. Desktop visual
baselines and collection-only corpus custody remain binding.

---

## DEC-0016 — Compact archive navigation is progressive enhancement, not a new destination

**Status:** Active · Ratified by owner direction in issue #242, implemented by #346, 2026-08-04

DEC-0012 remains the default operating rule. This decision authorizes one bounded,
corpus-disjoint wayfinding correction under the UX finishing program in issue #242:

- Every root surface and generated live or retired permanent record may use one
  shared navigation controller for progressive enhancement only.
- At compact widths, the complete existing primary navigation may become an
  explicit disclosure with accurate expanded state, keyboard Escape recovery,
  focus return, link-close behavior and touch-sized targets.
- With JavaScript disabled, the complete existing primary navigation remains
  visible and usable; script failure must not erase an archive destination.
- Primary navigation and the secondary archive map identify the current page or
  containing archive section with static semantics that remain truthful without
  JavaScript.
- Generated permanent-record pages remain deterministic disposable outputs. They
  must be rebuilt and verified, but they do not become a second committed corpus
  or navigation authority.

This decision does **not** add a public destination. Browse, Recognition Loop,
Coverage, Makers and About remain the permanent primary destinations. Connections
and Constellations remain contextual or secondary under DEC-0009. DEC-0015 remains
the authority for dense mobile evidence; this decision neither supersedes it nor
changes its disclosure contracts. The correction adds no reveal mechanic, specimen
field, schema concept, account layer, service, corpus interpretation or aesthetic
system, and it does not reopen general product development under DEC-0012.

---

## DEC-0017 — Configured presentation over a fixed evidence archive

**Status:** Active · Implemented by #981; effective on merge.
**Authority:** owner direction to start website configuration, followed by direction
on 2026-10-22 to finish it. The following is a scoped implementation decision, not
a verbatim owner quotation.

This supersedes DEC-0012's presentation freeze only for the configuration boundary
and the demonstrated typography/social-preview defects. The owner reviewed actual
desktop/mobile profile captures before directing completion. Canonical evidence,
new reveal mechanics, accounts, services, collection growth and roadmap milestones
remain under their existing authority.

- `config/sites/production.json` is the maintained configuration for the released
  website. The ordinary compiler applies it; rendered tests exercise that compiled
  artifact. Configuration, compiler and artwork inputs are release-hash-bound.
- Plain-text brand, labels/order of all five existing primary destinations, bounded
  layout dimensions and isolated alternate base paths form the closed v1 surface.
  Configuration cannot change records, claims, images, review states or tombstones.
- Production reconciles the existing Fraunces/Space Mono typography across pages.
  The social preview uses the existing casting-relief artwork and contains no
  changing roster count. Source/output hash binding protects that artwork.
- Both profile fixture and browser suites join the canonical release gate. Visual
  baselines change only for inspected configured presentation, never for evidence.
- The existing GitHub Pages origin remains the only authorized production deploy.
  Alternate root/nested builds remain explicitly identified, non-indexed previews.
  A build alone never issues `release.json`; complete release validation does.

DEC-0001's flip, DEC-0005's character-first opening, scoped evidence, missing versus
failed-image states, local fonts, keyboard access and no-JavaScript permanent
records remain binding. No scheduled collection process resumes.

---

## DEC-0018 — Precise source-preserving photo focus

**Status:** Active on merge.
**Authority:** owner-directed estate-executed Klingon photo refinement. This is
a bounded implementation decision, not a verbatim owner quotation.

The full 80-record photo review demonstrated a concrete limitation: the named
vertical positions can skip over a face in a tall source. Extend the existing
`image.focus` axes with integer 0–100 object-position percentages. Named positions
retain their exact behavior. The wall, interactive record, and no-JavaScript
permanent record consume the same values. Invalid values never become CSS.

This narrowly extends DEC-0003 and the DEC-0012 surface freeze for framing only.
The flip, unsplit frame, character-first opening, source photographs, provenance,
review votes, and record identities remain intact. No scale alignment, synthesized
face, new reveal, local-model approval, or autonomous collection is introduced.
Framing review is explicitly assistant review, not a new human identity attestation.

---

## DEC-0019 — Source-acquired Klingon photo quality and faithful display preparation

**Status:** Active on merge. **Authority:** the owner's repeated instruction to complete
Klingon photography using estate acquisition/processing and capable assistant review.
This is an implementation record, not a quotation or invented human approval.

- Acquire exact source photographs, retain file-page revisions and delivered bytes,
  preserve prior images and record IDs, and disclose conventional display processing.
- Existing fixed frames may use optional `image.fit=contain` when cover would remove
  part of a sourced head. `cover` remains the default. No new reveal is introduced.
- Optional `image.processing` discloses cropping, resampling and mild denoising.
  Each display asset is bound to retained parent bytes and an exact operation recipe.
  Ordinary interpolation does not claim recovered or generated detail.
- One documented portrait may serve multiple roles of the same named performer.
  Byte equality is permitted only for portrait sides with the same performer and source
  locator. Different performers, sources or image-side meanings still fail.
- Delegated source rulings use the existing second-desk resolution path with explicit
  `reviewer_kind=agent`, retained documentary identity evidence and separate presentation
  observations. These reviews do not count as human participation. Historical untyped
  reviews remain unchanged; role names alone provide no new human-review claim.
- The exact file-page attribution takes precedence over a generic page thumbnail when
  a page depicts multiple appearances. Rejected infant/adult or role/portrait substitutions
  become persistent rejection rules. Missing evidence remains explicit.

Synthetic portraits, generative restoration and new roster entries are outside this
release. DEC-0001/0005, no-JavaScript records, attribution and paused schedules remain.


## DEC-0020 — Catalog-wide source-photo quality maintenance

**Status:** Implemented on this branch; effective on merge.
**Authority:** owner direction on 2026-10-23: “do it for every listing in the database.”

Extend DEC-0019's existing source-acquisition, conventional preparation, framing,
and explicit agent-review process across the 1,368 current records. Preserve the
character-first reveal, record identities, credits and prose; keep unresolved
source gaps explicit. Image resemblance and matching names alone confer no identity.
Documentary source corrections retain previous assets and rejection rules.

The all-record assessment distinguishes source acquisition, reviewed presentation
changes, retained images, removed invalid bindings and unresolved source review.
It is not a whole-catalog identity certificate or a claim of exhaustive source search.
Preparation custody and offline replay cover both the existing Klingon batch and
the new catalog batch. Identical source bytes may be copied unchanged without
calling them restored or upscaled. No new scheduler, service, roster growth or
generative reconstruction is introduced. Complete release gates and real-photo
desktop/mobile readback remain required before delivery.
