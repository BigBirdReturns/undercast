# Visible evidence: UI review for PR #976

Before: merged media-correction base `5f61fa77ce369550e31c627b20deced429216700`.
After: locally qualified product commit `3b649191d689a835df8ba744187438285639b799`.

The captures use the actual repository image bytes, not the generic image fixture used by the existing deterministic visual regression suite. Desktop viewport: 1440×1000. Mobile viewport: 390×844. Light theme; reduced motion.

## card-back-desktop

| Before | After |
|---|---|
| ![Before card-back-desktop](before/card-back-desktop.png) | ![After card-back-desktop](after/card-back-desktop.png) |

## card-back-mobile

| Before | After |
|---|---|
| ![Before card-back-mobile](before/card-back-mobile.png) | ![After card-back-mobile](after/card-back-mobile.png) |

## card-front-desktop

| Before | After |
|---|---|
| ![Before card-front-desktop](before/card-front-desktop.png) | ![After card-front-desktop](after/card-front-desktop.png) |

## card-front-mobile

| Before | After |
|---|---|
| ![Before card-front-mobile](before/card-front-mobile.png) | ![After card-front-mobile](after/card-front-mobile.png) |

## connections-desktop

| Before | After |
|---|---|
| ![Before connections-desktop](before/connections-desktop.png) | ![After connections-desktop](after/connections-desktop.png) |

## connections-mobile

| Before | After |
|---|---|
| ![Before connections-mobile](before/connections-mobile.png) | ![After connections-mobile](after/connections-mobile.png) |

## coverage-desktop

| Before | After |
|---|---|
| ![Before coverage-desktop](before/coverage-desktop.png) | ![After coverage-desktop](after/coverage-desktop.png) |

## coverage-mobile

| Before | After |
|---|---|
| ![Before coverage-mobile](before/coverage-mobile.png) | ![After coverage-mobile](after/coverage-mobile.png) |

## recognition-desktop

| Before | After |
|---|---|
| ![Before recognition-desktop](before/recognition-desktop.png) | ![After recognition-desktop](after/recognition-desktop.png) |

## recognition-mobile

| Before | After |
|---|---|
| ![Before recognition-mobile](before/recognition-mobile.png) | ![After recognition-mobile](after/recognition-mobile.png) |

## record-desktop

| Before | After |
|---|---|
| ![Before record-desktop](before/record-desktop.png) | ![After record-desktop](after/record-desktop.png) |

## record-mobile

| Before | After |
|---|---|
| ![Before record-mobile](before/record-mobile.png) | ![After record-mobile](after/record-mobile.png) |

## recovery-desktop

| Before | After |
|---|---|
| ![Before recovery-desktop](before/recovery-desktop.png) | ![After recovery-desktop](after/recovery-desktop.png) |

## recovery-mobile

| Before | After |
|---|---|
| ![Before recovery-mobile](before/recovery-mobile.png) | ![After recovery-mobile](after/recovery-mobile.png) |

## wall-desktop

| Before | After |
|---|---|
| ![Before wall-desktop](before/wall-desktop.png) | ![After wall-desktop](after/wall-desktop.png) |

## wall-mobile

| Before | After |
|---|---|
| ![Before wall-mobile](before/wall-mobile.png) | ![After wall-mobile](after/wall-mobile.png) |

Full canonical gate on the product commit: 27/27 steps; 29 desktop + 15 mobile + 9 visual tests passed. The existing visual baselines were unchanged. These images document presentation, not new identity adjudication.
