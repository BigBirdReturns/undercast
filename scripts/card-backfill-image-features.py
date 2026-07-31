#!/usr/bin/env python3
"""Deterministic, local image-presentation features for card-backfill adjudication."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np


def _ocr_features(image: np.ndarray) -> tuple[int, float, bool]:
    if shutil.which("tesseract") is None:
        return 0, 0.0, False
    height, width = image.shape[:2]
    ocr_scale = min(1.0, 640.0 / max(height, width))
    if ocr_scale < 1.0:
        image = cv2.resize(
            image,
            (max(1, round(width * ocr_scale)), max(1, round(height * ocr_scale))),
            interpolation=cv2.INTER_AREA,
        )
        height, width = image.shape[:2]
    with tempfile.TemporaryDirectory(prefix="card-backfill-ocr-") as root:
        path = Path(root) / "image.png"
        if not cv2.imwrite(str(path), image):
            return 0, 0.0, False
        try:
            completed = subprocess.run(
                ["tesseract", str(path), "stdout", "--psm", "11", "tsv"],
                check=False,
                capture_output=True,
                text=True,
                timeout=8,
            )
        except (OSError, subprocess.TimeoutExpired):
            return 0, 0.0, False
    characters = 0
    area = 0
    for line in completed.stdout.splitlines()[1:]:
        columns = line.split("\t")
        if len(columns) < 12:
            continue
        try:
            confidence = float(columns[10])
            box_width = int(columns[8])
            box_height = int(columns[9])
        except ValueError:
            continue
        text = columns[11].strip()
        if confidence >= 60 and text:
            characters += len(text)
            area += max(0, box_width) * max(0, box_height)
    return characters, area / max(1, width * height), True


def analyze(path: Path) -> dict:
    raw = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if raw is None:
        raise ValueError(f"unreadable image {path}")
    had_alpha = raw.ndim == 3 and raw.shape[2] == 4
    if raw.ndim == 2:
        image = cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
    elif had_alpha:
        image = cv2.cvtColor(raw, cv2.COLOR_BGRA2BGR)
    else:
        image = raw
    original_height, original_width = image.shape[:2]
    scale = min(1.0, 900.0 / max(original_height, original_width))
    if scale < 1.0:
        image = cv2.resize(
            image,
            (max(1, round(original_width * scale)), max(1, round(original_height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(35, 35))
    face_ratios = sorted(
        (float(face_width * face_height) / max(1, width * height) for _x, _y, face_width, face_height in faces),
        reverse=True,
    )
    histogram = cv2.calcHist([gray], [0], None, [256], [0, 256]).ravel()
    probabilities = histogram / max(1.0, float(histogram.sum()))
    probabilities = probabilities[probabilities > 0]
    entropy = float(-(probabilities * np.log2(probabilities)).sum())
    white_ratio = float(np.mean(np.all(image > 245, axis=2)))
    dark_ratio = float(np.mean(np.all(image < 10, axis=2)))
    edge_density = float(np.mean(cv2.Canny(gray, 80, 180) > 0))
    laplacian_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    text_characters, text_area_ratio, ocr_available = _ocr_features(image)
    dominant_face = bool(
        face_ratios
        and face_ratios[0] >= 0.018
        and (len(face_ratios) == 1 or face_ratios[0] >= 2.5 * face_ratios[1])
    )
    return {
        "version": 1,
        "lane": "card-backfill-local-image-features",
        "path": str(path),
        "original_width": original_width,
        "original_height": original_height,
        "analysis_width": width,
        "analysis_height": height,
        "had_alpha": had_alpha,
        "face_count": len(face_ratios),
        "face_area_ratios": [round(value, 8) for value in face_ratios],
        "dominant_single_face": dominant_face,
        "entropy": round(entropy, 6),
        "white_ratio": round(white_ratio, 8),
        "dark_ratio": round(dark_ratio, 8),
        "edge_density": round(edge_density, 8),
        "laplacian_variance": round(laplacian_variance, 6),
        "ocr_available": ocr_available,
        "text_characters": text_characters,
        "text_area_ratio": round(text_area_ratio, 8),
        "canonical_mutation": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--out")
    arguments = parser.parse_args()
    result = analyze(Path(arguments.image).resolve())
    encoded = json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n"
    if arguments.out:
        output = Path(arguments.out).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded, end="")


if __name__ == "__main__":
    main()
