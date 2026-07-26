import json
import sys
from pathlib import Path

ALLOWED = {
    "CRIT-FAUN",
    "CRIT-SOLDIER",
    "CRIT-PALE",
    "CRIT-OFELIA",
    "SYFY-PALE",
}
TOP_LEVEL = {
    "wall_id",
    "side",
    "decision",
    "selected_ids",
    "ranking",
    "source_rationale",
    "risks",
    "certification",
}


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


if len(sys.argv) != 2:
    fail("expected candidate path")

try:
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
except Exception as exc:
    fail(f"invalid JSON: {type(exc).__name__}")

if not isinstance(payload, dict) or set(payload) != TOP_LEVEL:
    fail("top-level keys do not match the fixed schema")
if payload["wall_id"] != "UC-007" or payload["side"] != "still":
    fail("wrong target")
if payload["certification"] != "candidate-only":
    fail("candidate improperly claims certification")
if payload["decision"] not in {"single", "two-panel-composite", "defer"}:
    fail("invalid decision")

selected = payload["selected_ids"]
if not isinstance(selected, list) or len(selected) != len(set(selected)):
    fail("selected_ids must be a unique list")
if not set(selected).issubset(ALLOWED):
    fail("unknown selected candidate")

ranking = payload["ranking"]
if not isinstance(ranking, list) or len(ranking) != len(ALLOWED):
    fail("ranking must contain all five candidates")
ids = []
scores = []
for row in ranking:
    if not isinstance(row, dict) or set(row) != {"id", "score", "reason"}:
        fail("ranking row schema mismatch")
    if row["id"] not in ALLOWED:
        fail("unknown ranking id")
    if not isinstance(row["score"], int) or not 0 <= row["score"] <= 100:
        fail("score must be an integer from 0 through 100")
    if not isinstance(row["reason"], str) or not 10 <= len(row["reason"]) <= 300:
        fail("ranking reason length invalid")
    ids.append(row["id"])
    scores.append(row["score"])
if set(ids) != ALLOWED or len(ids) != len(set(ids)):
    fail("ranking ids must be exact and unique")
if scores != sorted(scores, reverse=True):
    fail("ranking must be sorted by descending score")

if payload["decision"] == "single" and selected != ids[:1]:
    fail("single decision must select the top-ranked id")
if payload["decision"] == "two-panel-composite" and set(selected) != set(ids[:2]):
    fail("composite decision must select exactly the top two ids")
if payload["decision"] == "defer" and selected:
    fail("defer decision must select no ids")

if not isinstance(payload["source_rationale"], str) or not 20 <= len(payload["source_rationale"]) <= 600:
    fail("source_rationale length invalid")
risks = payload["risks"]
if not isinstance(risks, list) or len(risks) > 5:
    fail("risks must be a list of at most five strings")
if any(not isinstance(risk, str) or not 5 <= len(risk) <= 300 for risk in risks):
    fail("risk entry length invalid")

print("PASS")
