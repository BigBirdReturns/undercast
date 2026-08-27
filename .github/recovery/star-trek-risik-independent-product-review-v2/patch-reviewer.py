#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import difflib
import hashlib
import json
import sys

if len(sys.argv) != 5:
    raise SystemExit(
        "usage: patch-reviewer.py ORIGINAL PATCHED RECEIPT DIFF"
    )

original_path = Path(sys.argv[1])
patched_path = Path(sys.argv[2])
receipt_path = Path(sys.argv[3])
diff_path = Path(sys.argv[4])

original = original_path.read_text(encoding="utf-8")

marker = "\n\ndef stable(value: Any) -> Any:\n"
helper = '''


def episode_projection(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise SystemExit(f"episode evidence is not a list: {value!r}")
    projected: list[dict[str, Any]] = []
    for row in value:
        if not isinstance(row, dict):
            raise SystemExit(f"episode evidence row is not an object: {row!r}")
        title = row.get("title")
        first_aired = row.get("first_aired")
        if not isinstance(title, str) or not isinstance(first_aired, str):
            raise SystemExit(f"episode evidence lacks title or air date: {row!r}")
        projected.append(
            {
                "title": title,
                "first_aired": first_aired,
            }
        )
    return projected
'''

if original.count(marker) != 1:
    raise SystemExit(
        f"expected one helper insertion marker, found {original.count(marker)}"
    )

replacements = (
    (
        'adjudication.get("confirmed_voiced_episodes") != EXPECTED_EPISODES',
        'episode_projection(adjudication.get("confirmed_voiced_episodes")) '
        '!= EXPECTED_EPISODES',
    ),
    (
        'source_summary.get("confirmed_voiced_episodes") != EXPECTED_EPISODES',
        'episode_projection(source_summary.get("confirmed_voiced_episodes")) '
        '!= EXPECTED_EPISODES',
    ),
)

patched = original.replace(marker, helper + marker, 1)
for old, new in replacements:
    if patched.count(old) != 1:
        raise SystemExit(
            f"expected one episode-projection patch anchor, found "
            f"{patched.count(old)}: {old}"
        )
    patched = patched.replace(old, new, 1)

if patched.count("episode_projection(") != 3:
    raise SystemExit("episode-projection repair cardinality drifted")
if 'EXPECTED_QUEUE = {' not in patched:
    raise SystemExit("queue control is absent")
if 'candidate_publication_admissible' not in patched:
    raise SystemExit("publication-admission control is absent")
if 'waterline_cycle_recorded' not in patched:
    raise SystemExit("waterline control is absent")
if 'canonical_mutation' not in patched:
    raise SystemExit("canonical-mutation control is absent")

patched_path.parent.mkdir(parents=True, exist_ok=True)
patched_path.write_text(patched, encoding="utf-8")
patched_path.chmod(0o755)

diff = "".join(
    difflib.unified_diff(
        original.splitlines(keepends=True),
        patched.splitlines(keepends=True),
        fromfile="v1/reviewer.py",
        tofile="v2/reviewer.py",
    )
)
diff_path.parent.mkdir(parents=True, exist_ok=True)
diff_path.write_text(diff, encoding="utf-8")

receipt = {
    "version": 2,
    "transaction": "STAR-TREK-RISIK-INDEPENDENT-REVIEW-PROJECTION-REPAIR-V2",
    "patched_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
    "classification": "episode-provenance-projection-normalization",
    "original_sha256": hashlib.sha256(original.encode()).hexdigest(),
    "patched_sha256": hashlib.sha256(patched.encode()).hexdigest(),
    "source_blob": "814bef1cf98a58d760f79d17c45d91e796358248",
    "comparison_projection": ["title", "first_aired"],
    "preserved_optional_fields": ["support_key"],
    "patched_predicates": [
        "source_review.adjudication.confirmed_voiced_episodes",
        "candidate.source_review.confirmed_voiced_episodes",
    ],
    "unchanged_controls": [
        "candidate Git lineage",
        "claim and lease custody",
        "queue closure",
        "canonical record",
        "media bytes",
        "four enforced media facets",
        "repository validation",
        "media gate",
        "waterline validation",
        "thesis validation",
        "Autopilot fixtures",
        "canonical main non-mutation",
        "waterline non-finalization",
    ],
    "product_logic_changed": False,
    "source_adjudication_changed": False,
    "media_logic_changed": False,
    "lease_logic_changed": False,
    "canonical_mutation": False,
    "additional_lease_issued": False,
}
receipt_path.write_text(
    json.dumps(receipt, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)
