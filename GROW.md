# GROW — how a model grows the wall (no API key)

UNDERCAST grows without a paid API. The **drafting model is the compute**: any
coding-session model (Claude Code, an agent, whatever can read this repo) drafts
new specimens, and a keyless script verifies and merges them. The tokens are
spent by the model doing the drafting — not by an API key in a workflow.

If you are that model, this is your job.

## The one rule for entry
A specimen is a **real, verifiable performer who vanishes under a designed face** —
heavy prosthetics, a mask, a full creature suit, motion capture, or an unseen
voice-only role. Not fame. If the audience mostly sees the performer *as
themselves*, they don't belong here.

## Do this

1. **Read the roster** so you don't duplicate:
   `node -e "console.log(require('./data/specimens.json').map(s=>s.actor).join('\n'))"`
2. **Draft** an array of new specimens into `data/drafts.json`. One object each,
   these keys (the script adds `id` and `link`):
   ```json
   {
     "character": "the in-character role",
     "actor": "the real performer's name (exact — it's verified against Wikipedia)",
     "aliases": "optional verified alternate professional names for identity matching",
     "production": "film / series",
     "universe": "one of: Star Trek, Film, Babylon 5, Farscape, Horror, TV, Voice, Kaiju",
     "years": "YYYY or YYYY–YY",
     "designer": "the maker(s): makeup/creature/costume designer or shop. Name several, separated by · & / — they become the maker index.",
     "transform": 1-5,
     "kind": "face" | "voice",
     "knownFor": "one sentence",
     "reveal": "two sentences — the human under the design",
     "references": "recommended array of claim-level sources: {claim, label, source, optional publisher}; claim is performance, design-build, production, biography, or interview",
     "conditions": "optional array; each item needs type, scope, note and its own source URL — see data/vocabularies/conditions.json",
     "wiki": "optional https://en.wikipedia.org/wiki/Name"
   }
   ```
3. **Merge** them (keyless — verifies each on Wikipedia, dedups, assigns the next
   `UC-###`, drops anything unverifiable, then empties the drafts file):
   ```bash
   node scripts/grow.mjs --drafts        # or: npm run grow -- --drafts
   ```
4. **Fill their faces**: `IMAGE_MODE=loose node scripts/retrieve.mjs`
   then `node scripts/credits.mjs && node scripts/needs.mjs`.
5. **Rebuild and validate every contract**: `node scripts/shard.mjs && node scripts/validate.mjs`.
6. **Commit** on a branch and open a PR.

## The non-negotiable
**Accuracy over volume. Never invent a person, a role, or a fact.** The
Wikipedia gate catches people who don't exist — it does NOT catch you being fuzzy
about a real person's character, designer, or years. If you aren't sure of the
facts, leave the card out. A wall of 300 true entries beats 1,000 with one lie in
it; the provenance is the whole point.

Draft in batches you can vouch for. Prefer the notable and well-documented. When
your confident pool runs low, stop — don't reach.

Production conditions are held to the same bar. Do not infer heat, restricted
vision, physical strain, application time, or danger from an image or costume.
Every `conditions[]` item carries its own source; if the source does not state the
condition, leave it out.

## Pinning the best image (vision review)

`retrieve.mjs` picks images by heuristic (mask: live-action over animated,
original era, in-character; portrait: free, period-appropriate, solo). Heuristics
read filenames and metadata — **not pixels**. To guarantee the *best-framed* mask
and face for a card, a model that can actually see has to look at the candidates
and choose. That's the second layer, and it's what makes a flip feel like a real
reveal (same framing, mask → face).

**The efficient way — `scripts/curate.mjs` (batch, automated):**
1. Gather candidate masks + faces for a batch of cards into one contact sheet
   (lead image + page images + File-namespace search, junk filtered, thumbnails
   cached locally so any renderer can load them):
   ```bash
   node scripts/curate.mjs gather UC-008 UC-010 UC-009 UC-026 UC-067
   ```
2. **Render `data/_curate/sheet.html` and look at it** (screenshot it). Each card
   shows its mask candidates (labelled `m1,m2,…`) and face candidates (`f1,f2,…`).
   Judge at a glance: a film screencap beats artwork/a poster/a cartoon; a clear
   front-facing face beats a group or a tiny cameo; prefer the role's era.
   *(Thumbnails are small — when a candidate is ambiguous, open its cached file in
   `data/_curate/thumbs/` to be sure. Art can look like a still at 150px.)*
3. Write your picks to `data/_curate/picks.json` and apply — the crawler will
   never auto-replace a pinned asset:
   ```json
   [{"id":"UC-008","still":"m3","portrait":"f2"}, {"id":"UC-067","portrait":"f1"}]
   ```
   ```bash
   node scripts/curate.mjs apply      # downloads the chosen images, pins them
   ```

**One-off pin** (when you already know the file): `node scripts/pin.mjs UC-001
--wiki <api> --still "Morn.jpg" --portrait "Mark Allen Shepherd.jpg"`.

Pinned assets carry `"pin": true` in `data/specimens.json`. Do a curate pass over
the marquee cards first; the crawler's heuristics are fine for the long tail.
