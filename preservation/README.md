# Preservation — do not lose the buffalo

UNDERCAST is a preservation system that publishes a website — not a website whose
JSON files happen to be the archive. This directory holds the machinery that keeps the
cultural record recoverable across storage engines, hosts, and decades.

## ⚠️ HISTORY GUARD — read before any `git gc` / history rewrite

The **full-resolution original assets exist only in git history** (before the R1 resize
commit). `baseline-manifest.json` inventories every one with its `sha256`, paired with
the resized derivative now on the wall and the exact transform recipe.

**Do NOT `git gc --prune`, `git filter-repo`, BFG, or force-rewrite history to shrink
`.git` until:**

1. `node scripts/preserve-bag.mjs <out>` has produced a BagIt bag of the originals, and
2. that bag has been verified (every byte matches the manifest hash) and moved to
   independent preservation storage (GhostBox / versioned object store).

Rewriting history first would permanently destroy the only remaining originals — it
would finish the destructive half of the resize. The resize was reversible *because*
history still holds the originals. Keep it that way until the bag exists elsewhere.

## Files

- `baseline-manifest.json` — inventory of pre-R1 originals recoverable from history:
  `{id, side, current{path,sha256,bytes}, original{path,sha256,bytes}, transform, origin, license}`.
  Regenerate with `node ../scripts/... ` (see the phase-0 tooling). Committable (hashes + metadata only, no image bytes).
- `../scripts/preserve-bag.mjs` — extracts + verifies the originals from history into a
  portable BagIt (RFC 8493) bag for offload. The bag itself does NOT live in this repo.

## Rights classes (for retention/replication/purge policy)

Assets are not all equal under the law. When originals move to preservation storage,
separate by rights basis (from each asset's `license` / `kind`):

- **free** — public-domain / CC0 / CC-BY(-SA): archive freely, replicate, WORM ok.
- **copyright / fan-use** — retained under fair-use display: subject to takedown; a
  takedown must purge the bytes and all public derivatives everywhere, leaving a
  tombstone + audit record. Do **not** WORM-lock these.
- **metadata / hashes / audit events** — always retainable, even after a byte takedown.
