# Media store — photographic bytes on GitHub Releases

GitHub Pages caps a published site at ~1 GB and soft-limits bandwidth to 100 GB/mo;
GitHub itself suggests Releases when a Pages project outgrows that. At ~30 KB/image
the wall hits the 1 GB Pages ceiling around **24,000 cards** — the image bytes are the
first real scaling wall, well before search. This moves *only photographic bytes* to
GitHub Releases (≤1,000 assets/release, <2 GiB each, no stated total-size cap), and
leaves the site, JSON records, provenance ledger, blanks, and code on Pages.

The archive stays reconstructable from plain records + provenance + assets, all inside
the same GitHub account. No second provider.

## How it resolves

`data/media-manifest.json` is the single source of truth for *where an image lives*.
It maps each local image path to its immutable, content-addressed release asset:

```json
"images/uc-004-still.jpg": {
  "id": "UC-004", "side": "still", "kind": "still",
  "sha256": "c05cab0b…", "asset": "uc-004-still-c05cab0b.jpg",
  "bytes": 24918, "w": 640, "h": 421,
  "release": "media-0001",
  "url": "https://github.com/OWNER/undercast/releases/download/media-0001/uc-004-still-c05cab0b.jpg",
  "location": "pending",   // "release" once actually uploaded
  "prov": "UC-004"
}
```

The front end reads only `url` + `location` — it has **no knowledge of the release
layout**. Resolution per image:

- entry `location:"release"` → load `url` (from `github.com`, allowed by the existing
  `img-src … https:` CSP). On failure → the **blank state** (a face-less "IMAGE OFFLINE"
  plaster panel — never a broken-image icon, never the generated humanoid life-cast,
  which is reserved for cards that simply have no photo).
- entry absent or `location:"pending"` → load the local `images/…` path from Pages.

So committing staged (`pending`) entries changes nothing live; only a successful upload
flips an image to release-served.

## Properties

- **Content-addressed.** `uc-004-still-<sha8>.jpg`. Replacing an image is a *new asset*,
  never a mutation — caching is forever, dedup and correction are deterministic.
- **Append-only.** Staging adds/updates manifest entries; uploads add release assets.
  Nothing is overwritten in place; superseded assets remain in their immutable release.
- **Release-sharded.** ≤800 assets per `media-NNNN` release (headroom under the 1,000
  limit). Shards fill in order; an image keeps its shard once assigned.
- **Gated.** `validate.mjs`'s `media.consistency` profile checks every entry: name is
  content-addressed, local bytes (if present) match the recorded hash, release tag +
  url format, provenance links to a specimen, per-release count ≤ capacity. And
  `ref.integrity` treats a `release`-located image as resolvable even after its local
  bytes are removed.

## Workflow — canary first, never a bulk move

1. **Stage** a batch: `node scripts/media-stage.mjs --canary` (or `--ids …` / `--all`).
   Writes/updates the manifest at `location:"pending"`. Commit it.
2. **Upload**: dispatch `.github/workflows/media.yml` (runs `media-upload.mjs` with the
   built-in `GITHUB_TOKEN`) — or run locally with a token. It creates the release(s),
   uploads the assets under their content-addressed names, verifies each byte size, and
   flips the entries to `location:"release"`, then commits the manifest. Idempotent.
   *(The workflow must exist on the default branch to be dispatchable.)*
3. **Verify live**: the migrated cards now load from Releases; check direct loading,
   caching, and that a deliberately-broken url falls to the blank state. The social
   preview (`og.png`) is a Pages asset, not a specimen photo, and is unaffected.
4. **Widen** once proven: stage larger batches and re-dispatch.
5. **Free Pages space (separate, later).** Only after the store is proven and a verified
   backup exists, remove migrated local bytes from `images/`. `ref.integrity` keeps
   passing because those images are `location:"release"`.

## History cleanup is a separate operation

Removing files from the latest tree does **not** remove their blobs from git history —
GitHub recommends keeping repos under ~1 GB, and shrinking `.git` requires rewriting
history. Do **not** rewrite history until the Release-backed store is stable and a
verified BagIt backup exists (see `preservation/README.md` — the HISTORY GUARD). This
pass does none of that; it is purely additive.
