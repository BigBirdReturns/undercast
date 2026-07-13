# UNDERCAST — Design System

Implementation doctrine for the experience. This is subordinate to
`docs/PRODUCT-CONSTITUTION.md` and `docs/DECISIONS.md`: when they set a rule, this
document says how to build it. Draft for owner ratification; values below reflect
the shipped site.

## 1. The aesthetic is load-bearing

UNDERCAST looks like a **forensic field guide / letterpress catalog**: warm bone
paper, registration marks, catalog numbers, a single sparingly-used red annotation.
This is not decoration — it is the identity, and it must not be "modernized" into a
generic streaming grid or a SaaS dashboard.

**Palette (canonical tokens):**

| token | value | role |
|---|---|---|
| `--plaster` | `#E4DFD5` | bone paper background |
| `--ink` | `#1C1A16` | primary ink |
| `--ink-soft` | `#5B564C` | body / secondary |
| `--ink-faint` | `#635E53` | small archival labels — **AA floor: keep ≥4.5:1 on plaster** |
| `--seam` | `#7C918D` | teal mold-line accent (the "CAST" of the wordmark, voice lens) |
| `--grease` | `#A83E30` | grease-pencil red — annotation only, used **sparingly** |
| `--line` | `#C3BCAD` | hairlines / rules |

Recognition uses its own light/dark token set (`--bg`, `--acc`, …); the wall is
light only. **Sitewide dark mode and global no-JS architecture are out of scope for
presentation PRs** unless a decision opens them.

**Type:** `Fraunces` (display serif, 400/600/900) for titles, names, numbers;
`Space Mono` (400/700) for kickers, labels, catalog voice. Fonts are the brand —
do not substitute. (Self-host them when hermeticity matters; see §9.)

## 2. Card anatomy — the primitive (DEC-0001)

A card has a **front** (the remembered character) and a **back** (the person). It
flips on an intentional action. Rules:

- The flip is a **temporal** reveal — a whole image per side. Never composite the
  two faces into one frame (that was the seam, DEC-0002).
- Front = character still; back = performer portrait. Same box, so the flip swaps
  mask → face in place.
- A visible **turn affordance** ("▸ turn the cast"). State is reflected **visibly**
  (the affordance updates) and **accessibly** (`aria-pressed`, a live accessible
  name for the face now shown, `aria-hidden` on the hidden face).
- **Focus discipline:** a card with **one** persistent flip control keeps focus on
  that control across flips. A card with **two** controls (front + back turn
  buttons, as the wall card) moves focus to the newly-revealed control. Do not copy
  one pattern onto the other.

## 3. Image and crop rules — DEC-0003

- Fixed frames default to an **upper-center crop**; optional per-image `focus`
  (`{x,y}`) overrides it. `focus` is the **only** crop-tuning field — retained.
- The retired `comparison` field and any `--compare-*`/`transform:scale` alignment
  hack must not return (DEC-0002/0003).
- Cropping is `object-fit: cover`. Do not add per-image `scale()` to "match" two
  photos — that is the seam problem; the flip needs no matching.

## 4. Character vs performer presentation — DEC-0005

- **Opening view: character only.** No performer portrait in the first viewport,
  including behind an opening flip. The person is met in the record.
- The **wall card** and the **record** may show the performer, because reaching
  them is intentional and past the opening. (Wall-card back status is DEC-0007, open.)
- When you show the performer, label it honestly ("The performer" / "The person");
  never present a performer portrait as the character or vice-versa.

## 5. Responsive hierarchy

- Mobile **visual order must equal DOM/focus order.** No visual-before-DOM tricks
  that put an image ahead of the heading a screen-reader hits first.
- No horizontal page scroll at any width; wide content (tables, card fans) scrolls
  inside its own container.
- The masthead is a **compact, proud nameplate**, not a hero-scale wordmark that
  competes with the content. Two heroes is zero heroes.

## 6. Accessibility expectations (non-negotiable)

- Skip link, landmarks (`header`/`main`/`nav`), one `aria-current="page"`.
- Real heading order; interactive controls are real `button`/`a` (Enter/Space).
- Visible `:focus-visible`; ≥24px (WCAG 2.5.8) target size on small controls.
- `aria-live` status for async results; `prefers-reduced-motion` respected.
- **Tap targets, contrast (§1 AA floor), and no-JS are checklist gates**, not
  afterthoughts (`docs/UI-REVIEW-CHECKLIST.md`).

## 7. Missing-evidence treatment (non-negotiable)

A missing or failed image renders as an **explicit absence** — the halftone casting
relief / "evidence not on file" mark — never a fabricated face and never a broken
`<img>`. A failed load updates the record's evidence status so failure is not
mistaken for missing data. Honesty is a design feature.

## 8. Approved reusable components — do not fork into microsites

Reuse these; do not invent per-page variants:

- The **site shell** (`assets/site-shell.css`): brand + Archive navigation. One nav,
  every page.
- The **flip card** (DEC-0001) — the reveal, everywhere it is used.
- The **absence graphic** (§7).
- The **record page generator** (`scripts/build-record-pages.mjs`) for permanent,
  no-JS records.

> **STOP.** A surface must not grow its own bespoke reveal, its own nav, or its own
> visual language. If a page needs something new, it becomes a shared component or
> it does not ship. "One-off microsite" is an anti-goal (CONSTITUTION §6).

## 9. No-JavaScript

The interactive JS-gated control must be **hidden** when scripting is off (so there
is no dead control), and a static fallback must stand in — and any "permanent
record" link from a fallback points at the durable **`./records/UC-…/`** route, not
a JS-only view. The homepage wall itself booting from JSON is a known limitation;
the durable path is the generated record pages.
