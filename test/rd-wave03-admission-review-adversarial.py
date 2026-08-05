#!/usr/bin/env python3
"""Adversarial mutation fixtures for the RD-W03 admission-review refusal ledger."""
from __future__ import annotations

import copy
import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "rd-wave03-admission-review.py"
spec = importlib.util.spec_from_file_location("rd_wave03_admission_review", SCRIPT)
if spec is None or spec.loader is None:
    raise SystemExit("unable to load admission-review verifier")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

protocol = module.load_json(ROOT / module.PERMANENT_PATHS[0])
manifest = module.load_json(ROOT / module.PERMANENT_PATHS[1])
module.validate_protocol(protocol)
module.validate_manifest(ROOT, manifest, protocol)

fixtures = []
for index in range(9):
    def unit_mutation(value, i=index):
        value["reviews"][i]["bindings"]["unit_identity"] = {"status": "verified", "reason_codes": []}
    fixtures.append((f"object {index+1} refuses inferred unit identity", unit_mutation))

    def event_mutation(value, i=index):
        value["reviews"][i]["bindings"]["event_class"] = {"status": "verified", "reason_codes": []}
    fixtures.append((f"object {index+1} refuses inferred event class", event_mutation))

    def chronology_mutation(value, i=index):
        value["reviews"][i]["bindings"]["chronology"] = {
            "status": "resolved",
            "event_date": "2026-08-05",
            "capture_time_is_event_time": True,
            "reason_codes": [],
        }
    fixtures.append((f"object {index+1} refuses capture-time chronology", chronology_mutation))

    def admission_mutation(value, i=index):
        value["reviews"][i]["decision"] = {
            "status": "admitted",
            "admitted": True,
            "classes_closed": 1,
            "reason_codes": [],
        }
    fixtures.append((f"object {index+1} refuses admission and closure", admission_mutation))

for label, mutate in fixtures:
    candidate = copy.deepcopy(protocol)
    mutate(candidate)
    try:
        module.validate_protocol(candidate)
    except (AssertionError, KeyError, TypeError, ValueError):
        print(f"PASS {label}")
    else:
        raise SystemExit(f"FAIL {label}")

policy_fixtures = [
    ("ordinal inference remains forbidden", "ordinal_unit_inference_allowed", True),
    ("live source requests remain zero", "live_source_requests", 1),
    ("candidate dates remain non-events", "candidate_date_is_event_date", True),
]
for label, key, value in policy_fixtures:
    candidate = copy.deepcopy(protocol)
    candidate["policy"][key] = value
    try:
        module.validate_protocol(candidate)
    except (AssertionError, KeyError, TypeError, ValueError):
        print(f"PASS {label}")
    else:
        raise SystemExit(f"FAIL {label}")

bad_manifest = copy.deepcopy(manifest)
bad_manifest["protocol_sha256"] = "0" * 64
try:
    module.validate_manifest(ROOT, bad_manifest, protocol)
except (AssertionError, KeyError, TypeError, ValueError):
    print("PASS manifest refuses protocol-hash drift")
else:
    raise SystemExit("FAIL manifest refuses protocol-hash drift")

print(f"RD-W03 admission review adversarial: {len(fixtures) + len(policy_fixtures) + 1} PASS")
