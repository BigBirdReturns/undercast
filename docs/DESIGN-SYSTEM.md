# UNDERCAST — Design System

Implementation doctrine for the experience, subordinate to
`docs/PRODUCT-CONSTITUTION.md` and `docs/DECISIONS.md`. Ratified through delegated
product/design review, 2026-07-13. This document does not invent rules the decision
log has not made; it describes how to build the ones it has, and records current
conventions.

## 1. The aesthetic is load-bearing

UNDERCAST looks like a **forensic field guide / letterpress catalog**: warm bone
paper, registration marks, catalog numbers, a single sparingly-used red annotation.
This is the identity and must not be "modernized" into a generic streaming grid.

**Palette — DESCRIPTIVE, not canonical (DEC-0010).** Shared CSS is the canonical
source for actual token values; this table describes intent and shows the current
values but is **not** a second source of truth. The values live inline in each page
today (an implementation gap DEC-0010 tracks) — prefer extracting them into shared
CSS custom properties over citing this table as law.

| token | value (current) | role |
|---|---|---|
| `--plaster` | `#E4DFD5` | bone paper background |
| `--ink` | `#1C1A16` | primary ink |
| `--ink-soft` | `#5B564C` | body / secondary |
| `--ink-faint` | `#635E53` | small archival labels — target ≥4.5:1 on plaster (AA) |
| `--seam` | `#7C918D` | teal mold-line accent |
| `--grease` | `#A83E30` | grease-pencil red — annotation only, used sparingly |
| `--line` | `#C3BCAD` | hairlines / rules |

Recognition uses its own light/dark token set. Sitewide dark mode and global no-JS
architecture are out of scope for a presentation PR unless a decision opens them.

**Type:** `Fraunces` (display serif) for titles/names/numbers; `Space Mono` for
kickers/labels/catalog voice. These are the brand. **Typography may change only
through an explicit design decision, not incidental substitution** (DEC-0010).
Self-host the fonts when a build must be hermetic.

## 2. Card anatomy — the primitive (DEC-0001)

- **Front** = the remembered character; **back** = the performer. Same box, so the
  flip swaps mask → face in place.
- A **temporal** reveal — **one unsplit frame per side** (cropped with
  `object-fit: cover`; never composite the two faces into one frame — that was the
  seam, DEC-0002).
- A visible **turn affordance**. State is reflected **visibly** (the affordance
  updates) and **accessibly** (`aria-pressed`, a live accessible name for the face
  shown, `aria-hidden` on the hidden face).
- **Focus discipline:** a **single** persistent flip control keeps focus on itself
  across flips; a card with **two** controls (front + back) moves focus to the newly
  revealed control. Match the pattern to the control count — do not copy one onto
  the other.

## 3. Image and crop rules — DEC-0003

- Fixed frames default to an **upper-center crop**; optional per-image `focus`
  (`{x,y}`) overrides it. `focus` is the only crop-tuning field and is retained.
- Do not re-introduce the retired `comparison` field or any `--compare-*` /
  `transform: scale()` alignment hack. The flip needs no per-pair matching.

## 4. Character vs performer presentation — DEC-0005 / DEC-0006 / DEC-0007

- **The default opening is not dominated by performer imagery**; character imagery
  or archive artwork comes first; a performer photograph appears only after
  deliberate visitor action (DEC-0005).
- The **wall card back** may reveal the performer + brief human context, earned by
  an intentional flip (DEC-0006/0007). The **record** owns depth.
- Label honestly ("The character" / "The performer"); never present one as the other.

## 5. Responsive hierarchy

- Mobile **visual order must equal DOM/focus order** — no visual-before-DOM tricks
  that put an image ahead of the heading a screen reader hits first.
- No horizontal page scroll at any width; wide content scrolls in its own container.
- Masthead scale is a **layout choice, not doctrine.** (A compact nameplate was a
  reviewer suggestion, not an owner decision — do not cite it as a rule.)

## 6. Accessibility expectations (non-negotiable)

Skip link, landmarks, one `aria-current="page"`; real heading order; real
`button`/`a` controls (Enter/Space); visible `:focus-visible`; ≥24px target size on
small controls; `aria-live` async status; `prefers-reduced-motion` respected. Tap
targets, contrast (§1 AA target), and no-JS are checklist gates, not afterthoughts.

## 7. Missing-evidence treatment (non-negotiable)

A missing or failed image renders as an **explicit absence** — the halftone casting
relief / "evidence not on file" mark — never a fabricated face and never a broken
`<img>`. A failed load updates the record's evidence status so failure is not
mistaken for missing data.

## 8. Shared vs page-specific — reuse principles, not pixels

Share these; do not fork them per page:

- The **site shell** (`assets/site-shell.css`): one brand + Archive navigation.
- The **flip primitive** (DEC-0001) — the character→performer reveal.
- The **absence graphic** (§7); the **record page generator**.
- The **tokens and principles** in this document.

**Page-specific layouts are legitimate.** Surfaces should share shell, tokens, and
principles **without becoming visually identical.**

> **STOP.** What a surface must *not* invent is a bespoke **character→performer
> reveal**, its own **navigation**, or its own **aesthetic language** (DEC-0001;
> CONSTITUTION §6). That is the "microsite" anti-goal — not page-specific layout.

## 9. No-JavaScript

A JS-gated interactive control must be **hidden** when scripting is off (no dead
control), with a static fallback standing in; any "permanent record" link from a
fallback points at the durable **`./records/UC-…/`** route, not a JS-only view. The
homepage wall booting from JSON is a known limitation; the durable path is the
generated record pages.
