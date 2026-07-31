#!/usr/bin/env python3
"""Dependency-free regression fixtures for wheel and distro OpenCV cascade layouts."""
from __future__ import annotations

import importlib.util
import sys
import tempfile
import types
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("card-backfill-image-features.py")

# Planning must prove path semantics without installing the local-desk runtime.
fake_cv2 = types.ModuleType("cv2")
fake_cv2.__file__ = "/tmp/card-backfill-fake-cv2/__init__.py"
fake_numpy = types.ModuleType("numpy")
sys.modules["cv2"] = fake_cv2
sys.modules["numpy"] = fake_numpy

SPEC = importlib.util.spec_from_file_location("card_backfill_image_features", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("unable to import card-backfill-image-features.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

with tempfile.TemporaryDirectory(prefix="card-backfill-image-feature-fixture-") as root:
    root_path = Path(root)
    wheel_root = root_path / "wheel-data"
    distro_root = root_path / "distro-data"
    wheel_root.mkdir()
    distro_root.mkdir()
    wheel_cascade = wheel_root / MODULE.CASCADE_NAME
    distro_cascade = distro_root / MODULE.CASCADE_NAME
    wheel_cascade.write_text("wheel fixture\n", encoding="utf-8")
    distro_cascade.write_text("distro fixture\n", encoding="utf-8")

    fake_cv2.data = types.SimpleNamespace(haarcascades=f"{wheel_root}/")
    with patch.object(MODULE, "SYSTEM_CASCADE_ROOTS", (distro_root,)):
        assert MODULE.resolve_haarcascade_path() == wheel_cascade

        del fake_cv2.data
        assert MODULE.resolve_haarcascade_path() == distro_cascade

        with patch.object(MODULE, "resolve_haarcascade_path", return_value=None):
            ratios, available = MODULE._face_features(object(), 320, 240)
        assert ratios == []
        assert available is False

print("card-backfill image feature fixtures: PASS — wheel and distro cascade layouts resolve; missing detector fails closed without importing OpenCV")
