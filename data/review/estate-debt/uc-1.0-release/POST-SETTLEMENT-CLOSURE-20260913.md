# UnderCast post-settlement closure - 2026-09-13

This addendum closes the residual physical and Git estate discovered after the original repository settlement. It preserves the accepted UnderCast 1.0 release as historical authority while preparing current `main` for a fresh gated Pages publication.

## Controlling state

- Starting `main`: `d0c904baaebe6790dbbe8cc2c04700384ecca806` / tree `297634d7429a90961918306615a81d9c9bb5cfbb`, clean and equal to `origin/main`.
- Live site before closure: `e15a5579860bdec8b63753b6a3aeb94f5aa42c54` / tree `40aa85deaceb7196bbd0891cf97322861cad3c24` / Pages run `34755301646`.
- Accepted 1.0 release remains `a084e934587e6153e0773571d5d4432c094dce0c` / tree `5861ea02dc51de8a66afc7b873bdbaa1be358863` / Pages run `34737141359` / deployment `6417622984`.

## External estate

The closure manifest binds 4,412 files and 2,930,709,178 bytes across five evidence roots. Its SHA-256 is `09d2c1316db68c157d7c166e846af6dd78b2733206b696895d78fdc07a466ecd`. A complete verification found zero missing, extra, size-mismatched, or hash-mismatched files.

| Root | Files | Bytes | Entries SHA-256 |
|---|---:|---:|---|
| `.media-audit` | 28 | 20,753,890 | `1d73291094ff5f4b2d84218dd1e652d1ef4083ce7c80cc236480a696e6d26f47` |
| `_recovered-from-photo-library` | 23 | 4,913,320 | `81149533841fecf70623c91f3df919686043c3f61552d2507acfe39bb5222c17` |
| `data` | 1 | 59,247 | `3e34f08fd69ee95c5dcfba933f2ba51945ad1ad43a72579263fac4e91954a62d` |
| `recovery` | 1,831 | 2,622,111,955 | `56e45dd65765102ef4fde8bd92dcbd7dd266bb28ba67563c6c83cf05dc78c426` |
| `reviews` | 2,529 | 282,870,766 | `d0f6ebe1109b8809fbac57533250750ecd96f3e0029ec6cb20a44e80c5beb980` |

## Residual worktree custody

- Published all eight previously local-only `recovered/*` tags to GitHub. The four July media-audit branch heads now have exact remote preservation identities.
- Consolidated 26 ignored media-audit artifacts, totaling 20,735,770 bytes, into the dedicated `.media-audit` custody root. Every copied file matched its source SHA-256; no collision occurred.
- Removed the three clean July media-audit worktrees after their tracked commits and ignored artifacts were preserved. The historical repository at `reviews/status-main-20260721` remains manifest-bound, clean, stash-free, and reduced to its own single worktree.
- Archived the expired Henoch claim at `refs/heads/archive/star-trek-henoch-expired-lease-20260913`, removed the stale active branch and worktree, and retained the current canonical task state: `queued`, zero attempts.
- Removed the merged settlement branch locally and remotely. The canonical repository now has one worktree and one local branch: `main`.

## Publication boundary

The live site was one commit behind current repository state because the bot-authored census commit did not recursively trigger Pages. This closure commit must publish through the normal `main` push path, complete the canonical 27-stage release gate, and bind the resulting public `release.json` to the exact closure commit and tree. Archive refs, recovered tags, and the historical review repository remain non-publication evidence.

Machine receipt: `POST-SETTLEMENT-CLOSURE-20260913.json` / SHA-256 `745c60988d74f6cbf97f7fefabbc8948cdfb891b7c28dba8fa91430ae68e35e3`.
Local refs snapshot: `LOCAL-REFS-CLOSURE-20260913.txt` / 62 lines / SHA-256 `b4a82a0b45550790f269680ba603257ab9804f6d00e060a3c87b5793913a8c2b`.
Remote refs snapshot: `REMOTE-REFS-CLOSURE-20260913.txt` / 1,939 lines / SHA-256 `fc1fc36241b0f7c32e93d116dd792f0979f80682a503284e23d0998c21d7e9f2`.
