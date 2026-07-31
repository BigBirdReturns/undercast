#!/usr/bin/env python3
"""Regression fixtures for distro and wheel OpenCV cascade layouts."""
from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

SCRIPT = Path(__file__).with_name("card-backfill-image-features.py")
SPEC = importlib.util.spec_from_file_location("card_backfill_image_features", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("unable to import card-backfill-image-features.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

resolved = MODULE.resolve_haarcascade_path()
if resolved is None or not resolved.is_file():
    raise SystemExit("fixture environment exposes no OpenCV frontal-face cascade")

# Reproduce Ubuntu's python3-opencv shape: cv2 imports, but cv2.data is absent.
distro_style = MODULE.resolve_haarcascade_path(
    extra_candidates=[resolved],
    include_module_data=False,
)
assert distro_style == resolved

with tempfile.TemporaryDirectory(prefix="card-backfill-image-feature-fixture-") as root:
    image_path = Path(root) / "blank.png"
    image = np.full((240, 320, 3), 127, dtype=np.uint8)
    assert cv2.imwrite(str(image_path), image)
    with patch.object(MODULE, "resolve_haarcascade_path", return_value=None):
        features = MODULE.analyze(image_path)
    assert features["face_detection_available"] is False
    assert features["face_count"] == 0
    assert features["dominant_single_face"] is False
    assert features["canonical_mutation"] is False

print("card-backfill image feature fixtures: PASS — wheel and distro cascade layouts resolve; missing detector fails closed without crashing")
