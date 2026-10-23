# Media store — photographic bytes on GitHub Releases

GitHub Pages caps a published site at ~1 GB and soft-limits bandwidth to 100 GB/mo;
GitHub itself suggests Releases when a Pages project outgrows that. At ~30 KB/image
the wall hits the 1 GB Pages ceiling around **24,000 cards** — the image bytes are the
first real scaling wall, well before search. This moves *only photographic bytes* to
GitHub Releases (≤1,000 assets/release, <2 GiB each, no stated total-size cap), and
leaves the site, JSON records, provenance ledger, blanks, and code on Pages.

The archive stays reconstructable from plain records + provenance + assets, all inside
the same GitHub account. No second provider.


## Subject correctness is a separate gate

Storage integrity proves which bytes were published; it does not prove that the
bytes depict the filed character or performer. The hash-bound consensus workflow
in [`docs/MEDIA-AUDIT.md`](docs/MEDIA-AUDIT.md) owns exact-subject identity and
presentation review. A release upload, provenance URL, or successful retrieval is
never treated as visual verification.

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

The full `media-manifest.json` (sha256/bytes/dims/prov for **all** images, pending and
released) is a build/CI artifact and is **not shipped to the browser**. `scripts/shard.mjs`
emits a lean **`data/media-live.json`** — only the `release`-located images as `{src: url}`
— and that (a few KB) is what the wall loads on boot, not the ~700 KB manifest. The front
end has **no knowledge of the release layout**; `mediaSrc` also pins the host (only an
exact `github.com/<owner>/<repo>/releases/download/...` URL is served, else the local path).
Resolution per image:

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

   ⚠️ **Verify before you delete.** The gate is offline: once local bytes are gone it can
   no longer re-hash an image, so `location:"release"` becomes an *assertion*, not a
   proof. `media-upload.mjs` downloads and sha256-verifies every asset against its
   content-addressed name at publish time — but a Release asset can be deleted and
   re-uploaded later by anyone with `contents:write`. Before deleting any local copy, run
   a networked audit that GETs each `release` url and confirms the served bytes still hash
   to the manifest `sha256`; never delete the local copy of an image whose release bytes
   haven't just been verified. (Size equality is not integrity.)

## Capacity & housekeeping

- Shards fill to **800 assets** (200 headroom under GitHub's 1,000/release limit) to
  absorb future **corrections** — a re-curated image is a *new* content-addressed asset in
  the same shard, and the old one is left in place (immutable). The headroom bounds how
  many corrections a shard can take before it must roll to the next; heavy re-curation over
  time may warrant lowering the fill target or reaping superseded assets.
- Deleting a card **orphans** its manifest entry. That's harmless (the wall keys by live
  card src, so an orphan is never served) and `media-stage.mjs` prunes it on its next run.

## History cleanup is a separate operation

Removing files from the latest tree does **not** remove their blobs from git history —
GitHub recommends keeping repos under ~1 GB, and shrinking `.git` requires rewriting
history. Do **not** rewrite history until the Release-backed store is stable and a
verified BagIt backup exists (see `preservation/README.md` — the HISTORY GUARD). This
pass does none of that; it is purely additive.

## Estate preparation and visual approval

Use the existing estate for source retrieval, caching, decoding, deduplication,
resizing, crop proposals, contact sheets and browser rendering. A capable visual
reviewer selects the actual source and presentation; local inference is optional
proposal assistance, never a prerequisite or an automatic approval authority.
Record agent review as agent review, rather than relabelling it as human review.

Retain the acquired image and source metadata. Prefer the existing `focus` controls
for framing-only corrections. Resampling or other image processing creates a
separate derivative with its source and operation retained. Generative cleanup,
upscaling or portrait reconstruction requires explicit derivative labelling and
visual comparison: synthesized detail is not source evidence. An illustrated or
reconstructed portrait must remain distinguishable from a sourced photograph and
must not inherit its verification state. Missing source evidence remains missing.

The Klingon and catalog releases are retained predecessors, not special-case
execution paths. `data/PHOTO-PREPARATIONS.json` indexes their immutable ledgers
and every later accepted batch. The generic commands below own new photo work.

## Repeatable estate photo work

Use `npm run photos -- …` in an isolated branch. The photo worker is ordinary
Python and Pillow; the review/staging checks use the existing Node archive tools.
Set `PHOTO_PYTHON` to an environment installed from `requirements-photo.txt`.
Cache and run directories belong in the estate's scratch/cache locations, outside
any checkout. There is no mandatory vision model, hosted inference call, scheduler,
new database service, or automatic commit/push/deployment.

```bash
export PHOTO_PYTHON=/path/to/photo-venv/bin/python
export RUN=/path/to/scratch/farscape-photo-batch
export CACHE=/path/to/shared/photo-cache
npm run photos -- plan --canon farscape --limit 16 --run "$RUN"
npm run photos -- collect --run "$RUN" --cache "$CACHE"
# A capable assistant examines candidates.html and exact source text,
# then edits source-review.json. Generated decisions start pending.
npm run photos -- prepare --run "$RUN"
# Review prepared.html in both 4:3 and 4:5 frames; explicitly approve
# the exact display hashes and recipes in display-review.json.
npm run photos -- stage --run "$RUN"
# Commit the reviewed candidate, then run the ordinary release gate.
npm run gate
npm run photos:acceptance -- --run "$RUN"
# After reviewed merge and deployment, repeat against the actual public site.
npm run photos:acceptance -- --run "$RUN" \
  --base-url https://bigbirdreturns.github.io/undercast/
```

`--canon` selects records through the existing estate registry's exact label,
production text and documented source hosts, never a broad generic Film/TV shelf.
Use `--ids UC-…,...` for an exact work order, `--side still|portrait|both` for a
specific side, and `--refresh` on **plan** to include already verified images.
Mixed/franchise-spanning records may need explicit IDs. `--records FILE` permits
research over an explicitly supplied staging array; **stage refuses a record that
has not entered the canonical collection through the existing ingestion rules**.
Register an unfamiliar canon as inventory through `data/ESTATE-REGISTRY.json`;
photo preparation does not certify its role adapter or authorize roster growth.

For ambiguous titles or a performer documented in another franchise, pass
`--sources FILE` to **plan**. The file is an array of
`{"id":"UC-664","side":"still","urls":["https://farscape.fandom.com/wiki/Pilot_(Moya)"]}`.
These exact source-page hints are retained with the batch. They choose where to
look, not what to believe. Supported automatic acquisition uses MediaWiki APIs
on the registered wiki hosts, Wikipedia and Commons. A new source technology
requires a bounded collector extension; arbitrary websites are not silently
claimed as supported adapters.

Collection preserves file-page revisions, attribution, source bodies, delivered
bytes and upstream-versus-delivered hashes. Source pages and originals are
content-addressed in the shared cache; downloads and failures have bounded
budgets, timeouts and per-host pacing shared across workers. 401/403 are recorded,
not bypassed. `collect --offline` must reproduce candidates without requests;
`collect --refresh` deliberately reacquires current source snapshots. Reusing
cached evidence does not claim that its upstream revision is still current.
Parallel jobs use distinct run directories and may share the cache. Previously fetched
performer/source bytes are reused across batches; publication still uses the existing documented
same-performer reuse rule, rather than treating a matching name as identity proof.

The two review files separate documentary subject/production selection from
visual composition. Exact quoted passages must exist in retained source bytes.
A record change, changed source, unrecognized operation, rejected image, stale
review or changed display hash refuses staging. A source or display decision may
retain or defer a case, including a missing portrait. Agent decisions are typed
as agent participation and use the existing delegated audit-resolution path;
no generated form marks itself approved or claims human consensus.

Preparation preserves the full source and produces non-destructive crop/resize
recipes. GIF acquisition is supported only for a single static frame and is
encoded as a supported display format; animated sources require a separately
reviewed frame operation. Conventional resampling never claims recovered detail.
Generative restoration and new source types need explicit retained operations
and disclosure before admission; this command does not silently synthesize faces.

Staging takes an exclusive per-checkout writer lock, requires a clean named branch,
and checks that the selected canonical records
have not changed, retains the source/display reviews and originals, updates the
existing specimen/source/audit projections and runs their native validators.
Running **stage** again is an exact no-op; a superseded batch refuses reapplication.
It returns `staged-not-published` until the normal release and actual public
readback finish. There is no separate photo publishing service.

The regression commands are `npm run photos:fixtures` (also part of the canonical
media gate) and `$PHOTO_PYTHON scripts/photo-pixel-tests.py`. Independent recipe
replay is `$PHOTO_PYTHON scripts/replay-photo-preparations.py --run "$RUN"` before
staging, or `--ledger data/review/photo-…/changes.json` afterward. Replay of the
older explicitly denoised Klingon images additionally needs their retained
OpenCV/Numpy runtime. Review JSON uses canonical LF text across Windows/Linux; exact upstream API
response bodies use byte-preserving `.capture` files. A codec/version mismatch
fails byte replay rather than
upgrading a receipt or silently blessing different output.

`photos:acceptance` checks the real compiled site, actual images and constrained
crop boxes on desktop/mobile, keyboard reveal and no-JavaScript permanent routes.
In public mode it first checks the served release against the qualified payload
and uses real network requests without replacement images. Historical source
and release URLs are followed from their declared manifests, never guessed from
local image paths. The lightweight gallery is a private review tool, not an
alternative public reveal or a substitute for actual-site acceptance.
A successful load and valid crop box do not establish good composition. Review the
actual character-to-performer flip for headroom, apparent head size and shoulders.
When the original is already an extreme close-up, acquire a wider source rather
than repeatedly adjusting focal position. Retain an actual-image regression for
an owner-reported composition defect; generic image fixtures cannot prove it fixed.

### Interrupted staging

Staging now prepares and validates the complete candidate in a disposable Git
worktree beside the explicit run directory before changing the requested checkout.
Temporary promotion objects are removed after successful validation; retained
source originals and recipes stay in canonical custody. A failed acquisition, audit or
projection leaves that checkout untouched. Promotion retains an exact per-file
predecessor/successor journal under the checkout-specific Git directory before
writing any canonical file. An interrupted promotion resumes only when HEAD,
source/display decisions and every affected file still match that transaction.
Intervening edits stop recovery rather than being overwritten.

Rerun the same stage command after an ordinary failure. After a killed process,
append `--recover`; the lock is reclaimed only for a confirmed dead process on
the same host. Live or foreign locks remain blocked. Successful retries rerun
current audit and projection invariants before reporting `already-staged`. A
staging receipt describes a validated local candidate, never deployment.
