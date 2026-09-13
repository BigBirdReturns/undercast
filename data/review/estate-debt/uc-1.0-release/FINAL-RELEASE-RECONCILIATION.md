# UnderCast 1.0 final release reconciliation

**Status: SHIPPED**

UnderCast is deployed from exact commit `a084e934587e6153e0773571d5d4432c094dce0c` and tree `5861ea02dc51de8a66afc7b873bdbaa1be358863` at <https://bigbirdreturns.github.io/undercast/>. Remote `main` resolves to the same commit, the validation worktree is clean, and no Git tag points at the release commit.

## Bound release identity

- Payload: **1,721 files** plus `release.json`
- Payload SHA-256: `1f1a3105d121c798f546be0acf6057e47a6988041449bfe5c72018c4d8f10120`
- Input SHA-256: `fc88aed40146e5a75f8bece5436fc47f91892b125b4245b18b382ac689aee918`
- Media SHA-256: `3e5d8e3b0fca2becd1b25f9b77f7f3de221ddb46c4fb1c9027a0f9769ddb3f2e`
- Canonical receipt SHA-256: `3d601df970edb670dec3ab9da1f05af940311ae4f4172e4acd1f0bf99e026d8e`
- `release.json` file SHA-256: `9385f235fce2d2181113379c27bde8aaaf558f6e3f4afcfcd89d6c1e29284e74`
- Permanent records: **1,370** = 1,368 live specimens + 2 tombstones
- Media references: **2,039**
- Manifest-bound media shards: **12**

The CI-generated `release-identity.json` is byte-identical to the locally verified envelope. GitHub Pages run `34737141359` completed both build job `103670468352` and deploy job `103672048827` successfully. Deployment `6417622984` reached `success` at 2026-09-13T04:23:02Z.

## Acceptance

The complete ordinary and release-mode gates each passed all 27 stages. Publisher custody, archive contract, thesis rails, and Pages are terminal and successful for the exact release SHA. Live acceptance verified 14 representative files byte-for-byte, including both ends of the media-shard set, and passed 12 browser groups covering wall state restoration, recognition media, security return targets, theme persistence, mobile navigation, static no-JavaScript records, and network/runtime error surfaces.

## Closed release defects

The release campaign repaired the Estate SSH-client selection regression, the publisher sparse-checkout import closure, OS-qualified visual baselines, and the missing media-shard publication closure. The final live deployment reports zero same-origin HTTP failures, request failures, console errors, or uncaught page errors.

## Tag disposition

No semantic tag or GitHub Release was minted. The commission supplied no authoritative tag name or package-version transition, while the repository intentionally retains package version `0.1.0` and uses existing tags for preservation/media custody. The exact tag field is therefore **unminted by authority**, rather than an invented `v1.0.0`.

## Durable receipts

- Post-publication receipt: `D:\Projects\Products\UnderCast\recovery\uc-1.0-20260911\release-fix-20260912\POST-PUBLICATION-A084E934.json`
- Receipt SHA-256: `aca6462430ea12b3e31b7b76b519193ec543ec9e37ec8cea3c75e8be46d3df75`
- Live byte acceptance: `D:\Projects\Products\UnderCast\recovery\uc-1.0-20260911\release-fix-20260912\LIVE-BYTE-ACCEPTANCE-A084E934.json`
- Live browser acceptance: `D:\Projects\Products\UnderCast\recovery\uc-1.0-20260911\release-fix-20260912\LIVE-ACCEPTANCE-A084E934.json`
- Estate control acceptance: `D:\Projects\Products\UnderCast\recovery\uc-1.0-20260911\release-fix-20260912\ESTATE-CONTROL-ACCEPTANCE.json`
- Source checkpoint: `D:\Projects\Products\UnderCast\recovery\uc-1.0-20260911\resume-20260912\checkpoint-20260913T025515Z\working-files.zip` (`a3ddbc728bbe28dffd2492066e63e92397a40f612811f394abf384895b6c157a`)
