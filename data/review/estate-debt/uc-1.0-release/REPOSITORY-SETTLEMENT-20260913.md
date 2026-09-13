# UnderCast repository settlement — 2026-09-13

This receipt accounts for the physical W01 estate before the post-1.0 website maintenance release. It separates production authority, recoverable archival history, active collection work, and disposable duplicate checkouts.

## Controlling identities

- Accepted UnderCast 1.0 release: `a084e934587e6153e0773571d5d4432c094dce0c` / tree `5861ea02dc51de8a66afc7b873bdbaa1be358863` / Pages run `34737141359` / deployment `6417622984`.
- Repository baseline entering settlement: `62fdd04061da7b238c44df9183e3229977b2477c` / tree `c282e5ecc7844c01584783e7ce04f4e18eaf5ed2`; local `main` and `origin/main` matched.
- Estate file manifest: `ESTATE-FILE-MANIFEST-20260913.json` SHA-256 `4c5ac12b4793ba1276246ed2a6d6e9ba9b1e3e681aef8781c3d8ef99e4518463`.
- Machine settlement receipt: `REPOSITORY-SETTLEMENT-20260913.json` SHA-256 `5df41cf49cc41bb15a6ad2c256e38469b22350360a167b20a5e1bba4dd04e48e`.

## Git disposition

- 24 current remote refs in scope bind recovered, superseded, standalone-clone, rescue, or active work exactly. Archive refs do not authorize publication or rollback.
- Two standalone clones were clean and stash-free. Every local branch head was pushed under a dated archive namespace before removal.
- Five superseded worktrees were removed after their dirty or unique state was committed and pushed. The canonical checkout and active clean Henoch worktree remain.
- Local branches now contain only `main`, the settlement branch, and the active Henoch branch.

## External estate custody

| Root | Files | Bytes | Manifest SHA-256 |
|---|---:|---:|---|
| `.media-audit` | 2 | 18,120 | `aea8e2779310928d61b46cb33a90993eb415b8ee557128a9663a775038fd2d27` |
| `_recovered-from-photo-library` | 23 | 4,913,320 | `a26bdd2506dde86a408f31c734c6ff9bf184b9e492e502c7425798b1159f2981` |
| `data` | 1 | 59,247 | `bead417c8e7b74bc07e633343b32bffc2324fae641d5c9a25384d5d1a9422c68` |
| `recovery` | 1,831 | 2,622,111,955 | `c48f0c4e7fda53db3d37192469c205f8ace31f165c73fcbb99abf845924d6a65` |
| `reviews` | 2,550 | 283,535,500 | `be7082945c80104ddb2736939ba3475c17b14485da478d759487fad206a8d53b` |

The external manifest hashes every file in the included evidence roots. Git accounts for the canonical checkout by commit and tree. Worktrees are accounted by branch and commit; ignored dependency installations are disposable and carry no evidence authority.

## Release authority

The copied final reconciliation and post-publication receipt retain their original SHA-256 identities. The next Pages update must originate from a clean main checkout, complete the canonical release gate, publish a new `release.json`, and pass live byte and browser verification. No archive branch or retained worktree may substitute for that path.
