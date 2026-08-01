#!/usr/bin/env node
import fs from "node:fs";

const actionPath = ".github/actions/card-backfill-runtime/action.yml";
const fixturePath = "scripts/card-backfill-amortization-fixtures.mjs";

const actionTemplate = String.raw`name: card-backfill-runtime
description: Install only the deterministic image tooling required by the current card-backfill job.
inputs:
  profile:
    description: 'auto, discovery, or local-desk; auto maps the discover job to the lean discovery runtime'
    required: false
    default: auto
runs:
  using: composite
  steps:
    - shell: bash
      env:
        REQUESTED_PROFILE: __CARD_BACKFILL_PROFILE_INPUT__
      run: |
        set -euo pipefail
        mkdir -p "__DOLLAR__RUNNER_TEMP/card-backfill-bin"

        profile="__DOLLAR__REQUESTED_PROFILE"
        if [ "__DOLLAR__profile" = auto ]; then
          case "__DOLLAR__{GITHUB_JOB:-}" in
            discover) profile=discovery ;;
            *) profile=local-desk ;;
          esac
        fi
        case "__DOLLAR__profile" in
          discovery|local-desk) ;;
          *) echo "invalid card-backfill runtime profile: __DOLLAR__profile" >&2; exit 2 ;;
        esac
        echo "PROFILE — card-backfill runtime=__DOLLAR__profile job=__DOLLAR__{GITHUB_JOB:-unknown}"

        packages=()
        if ! command -v magick >/dev/null 2>&1 && \
           { ! command -v identify >/dev/null 2>&1 || ! command -v convert >/dev/null 2>&1 || ! command -v montage >/dev/null 2>&1; }; then
          packages+=(imagemagick)
        fi

        need_headless_cv=false
        if [ "__DOLLAR__profile" = local-desk ]; then
          if ! python3 - <<'PY'
        from pathlib import Path
        import cv2
        import numpy
        name = "haarcascade_frontalface_default.xml"
        data = getattr(cv2, "data", None)
        roots = [Path(data.haarcascades)] if data is not None and getattr(data, "haarcascades", None) else []
        raise SystemExit(0 if any((root / name).is_file() for root in roots) else 1)
        PY
          then
            need_headless_cv=true
            if ! python3 -m pip --version >/dev/null 2>&1; then
              packages+=(python3-pip)
            fi
          fi
          if ! command -v tesseract >/dev/null 2>&1; then
            packages+=(tesseract-ocr)
          fi
        fi

        if [ "__DOLLAR__{#packages[@]}" -gt 0 ]; then
          sudo apt-get update
          sudo apt-get install -y "__DOLLAR__{packages[@]}"
          printf 'INSTALLED — %s\n' "__DOLLAR__{packages[*]}"
        else
          echo "PASS — __DOLLAR__profile apt runtime already present; apt work avoided"
        fi

        if [ "__DOLLAR__need_headless_cv" = true ]; then
          python3 -m pip install \
            --disable-pip-version-check \
            --no-input \
            --user \
            --break-system-packages \
            'numpy==1.26.4' \
            'opencv-python-headless==4.10.0.84'
          echo 'INSTALLED — deterministic headless OpenCV wheel; distro GUI/GPU dependency tree avoided'
        fi

        if command -v magick >/dev/null 2>&1; then
          echo 'PASS — ImageMagick 7 command is available'
        else
          command -v identify >/dev/null
          command -v convert >/dev/null
          command -v montage >/dev/null
          cat > "__DOLLAR__RUNNER_TEMP/card-backfill-bin/magick" <<'SH'
        #!/bin/sh
        command="__DOLLAR__1"
        case "__DOLLAR__command" in
          identify|montage)
            shift
            exec "__DOLLAR__command" "__DOLLAR__@"
            ;;
          *)
            exec convert "__DOLLAR__@"
            ;;
        esac
        SH
          chmod +x "__DOLLAR__RUNNER_TEMP/card-backfill-bin/magick"
          echo "__DOLLAR__RUNNER_TEMP/card-backfill-bin" >> "__DOLLAR__GITHUB_PATH"
          echo 'PASS — ImageMagick 6 compatibility command installed'
        fi

        if [ "__DOLLAR__profile" = discovery ]; then
          echo 'PASS — lean discovery runtime omits OpenCV, NumPy, cascade data, and Tesseract'
          exit 0
        fi

        python3 - <<'PY'
        from pathlib import Path
        import cv2
        import numpy
        name = "haarcascade_frontalface_default.xml"
        data = getattr(cv2, "data", None)
        roots = [Path(data.haarcascades)] if data is not None and getattr(data, "haarcascades", None) else []
        cascade = next((root / name for root in roots if (root / name).is_file()), None)
        if cascade is None:
            raise SystemExit("OpenCV face cascade is unavailable after headless runtime installation")
        print(f'PASS — local image desk runtime: OpenCV {cv2.__version__}; NumPy {numpy.__version__}; cascade={cascade}')
        PY
        tesseract --version | head -n 1
        echo 'PASS — local desk uses pinned headless OpenCV rather than the distro GUI/GPU stack'
`;

let action = actionTemplate.replaceAll("__DOLLAR__", "$");
const placeholder = "__CARD_BACKFILL_PROFILE_INPUT__";
if ((action.split(placeholder).length - 1) !== 1) {
  throw new Error("profile-input placeholder cardinality drift");
}
action = action.replace(placeholder, "$" + "{{ inputs.profile }}");
fs.writeFileSync(actionPath, action);

let fixture = fs.readFileSync(fixturePath, "utf8");
const oldBlock = `assert(files.runtime.includes("packages+=(python3-opencv)"));
assert(files.runtime.includes("packages+=(opencv-data)"));`;
const newBlock = `assert(files.runtime.includes("opencv-python-headless==4.10.0.84"));
assert(files.runtime.includes("numpy==1.26.4"));
assert(files.runtime.includes("--break-system-packages"));
assert(files.runtime.includes("pinned headless OpenCV"));
assert(!files.runtime.includes("packages+=(python3-opencv)"));
assert(!files.runtime.includes("packages+=(opencv-data)"));`;
const count = fixture.split(oldBlock).length - 1;
if (count !== 1) throw new Error(`expected one distro-OpenCV fixture block, found ${count}`);
fixture = fixture.replace(oldBlock, newBlock);
fs.writeFileSync(fixturePath, fixture);

if (!action.includes("REQUESTED_PROFILE: $" + "{{ inputs.profile }}")) {
  throw new Error("literal composite action input was not emitted");
}
console.log("PASS — deterministic headless runtime and regression contract constructed");
