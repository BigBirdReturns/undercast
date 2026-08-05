#!/usr/bin/env python3
from pathlib import Path
import hashlib
import sys

root = Path(sys.argv[1])
workflow = root / ".github/workflows/rd-wave03-hosted-executor.yml"
helper = root / "tmp/rd-wave03-integration.sh"
text = workflow.read_text()
start_marker = '          runs_url="repos/BigBirdReturns/undercast/actions/runs?head_sha=${REJECTED_EXECUTOR_SHA}&per_page=100"\n'
end_marker = '          }\' "$evidence/predecessor-runs-initial.json" > "$evidence/preflight.json"\n'
start = text.index(start_marker)
end = text.index(end_marker, start) + len(end_marker)
replacement = '          runs_url="repos/BigBirdReturns/undercast/actions/runs?head_sha=${REJECTED_EXECUTOR_SHA}&per_page=100"\n          active_filter=\'[.workflow_runs[] | select(.name == "RD-W03 hosted exact-head executor") | select(.status == "queued" or .status == "in_progress" or .status == "waiting" or .status == "requested" or .status == "pending") | .id]\'\n          rejected_terminal_filter=\'[.[] | select(.status != "completed" or (.conclusion != "cancelled" and .conclusion != "failure"))]\'\n          rejected_predecessor_filter=\'[.workflow_runs[] | select(.name == "RD-W03 hosted exact-head executor") | select(.status != "completed" or (.conclusion != "cancelled" and .conclusion != "failure")) | {id, name, status, conclusion, event, head_sha}]\'\n          gh api --method GET "$runs_url" > "$evidence/predecessor-runs-initial.json"\n          jq "$active_filter" "$evidence/predecessor-runs-initial.json" > "$evidence/active-runs-initial.json"\n          while IFS= read -r run_id; do\n            [[ -n "$run_id" ]] || continue\n            gh api --method POST "repos/BigBirdReturns/undercast/actions/runs/${run_id}/cancel" || true\n          done < <(jq -r \'.[]\' "$evidence/active-runs-initial.json")\n          cp "$evidence/predecessor-runs-initial.json" "$evidence/predecessor-runs-final.json"\n          jq "$active_filter" "$evidence/predecessor-runs-final.json" > "$evidence/active-runs-final.json"\n          jq "$rejected_predecessor_filter" "$evidence/predecessor-runs-final.json" > "$evidence/rejected-predecessor-runs-final.json"\n          : > "$evidence/initially-active-runs-final.ndjson"\n          jq -s \'.\' "$evidence/initially-active-runs-final.ndjson" > "$evidence/initially-active-runs-final.json"\n          jq "$rejected_terminal_filter" "$evidence/initially-active-runs-final.json" > "$evidence/rejected-terminal-runs.json"\n          for attempt in $(seq 1 20); do\n            gh api --method GET "$runs_url" > "$evidence/predecessor-runs-final.json"\n            jq "$active_filter" "$evidence/predecessor-runs-final.json" > "$evidence/active-runs-final.json"\n            jq "$rejected_predecessor_filter" "$evidence/predecessor-runs-final.json" > "$evidence/rejected-predecessor-runs-final.json"\n            : > "$evidence/initially-active-runs-final.ndjson"\n            while IFS= read -r run_id; do\n              [[ -n "$run_id" ]] || continue\n              gh api --method GET "repos/BigBirdReturns/undercast/actions/runs/${run_id}" >> "$evidence/initially-active-runs-final.ndjson"\n            done < <(jq -r \'.[]\' "$evidence/active-runs-initial.json")\n            jq -s \'.\' "$evidence/initially-active-runs-final.ndjson" > "$evidence/initially-active-runs-final.json"\n            jq "$rejected_terminal_filter" "$evidence/initially-active-runs-final.json" > "$evidence/rejected-terminal-runs.json"\n            if [[ "$(jq \'length\' "$evidence/active-runs-final.json")" -eq 0 && "$(jq \'length\' "$evidence/rejected-terminal-runs.json")" -eq 0 && "$(jq \'length\' "$evidence/rejected-predecessor-runs-final.json")" -eq 0 ]]; then\n              break\n            fi\n            sleep 3\n          done\n          test "$(jq \'length\' "$evidence/active-runs-final.json")" -eq 0\n          test "$(jq \'length\' "$evidence/rejected-terminal-runs.json")" -eq 0\n          test "$(jq \'length\' "$evidence/rejected-predecessor-runs-final.json")" -eq 0\n          jq --slurpfile initially_active "$evidence/active-runs-initial.json" \\\n             --slurpfile finally_active "$evidence/active-runs-final.json" \\\n             --slurpfile initial_terminal "$evidence/initially-active-runs-final.json" \\\n             --slurpfile rejected_terminal "$evidence/rejected-terminal-runs.json" \\\n             --slurpfile rejected_predecessor "$evidence/rejected-predecessor-runs-final.json" \'{\n            rejected_controller: "7c881d39f50f87e0df88cffa10a490fa1182fd14",\n            observed_runs_initial: [.workflow_runs[] | select(.name == "RD-W03 hosted exact-head executor") | {id, name, status, conclusion, event, head_sha}],\n            initially_active_runs: $initially_active[0],\n            initially_active_run_states_final: [$initial_terminal[0][] | {id, name, status, conclusion, event, head_sha}],\n            rejected_initial_terminal_runs: $rejected_terminal[0],\n            rejected_predecessor_runs_final: $rejected_predecessor[0],\n            finally_active_runs: $finally_active[0],\n            predecessor_quiescent_before_lane_release: (($finally_active[0] | length) == 0),\n            rejected_initial_runs_ended_cancelled_or_failed: (($rejected_terminal[0] | length) == 0),\n            all_observed_predecessor_runs_ended_cancelled_or_failed: (($rejected_predecessor[0] | length) == 0)\n          }\' "$evidence/predecessor-runs-initial.json" > "$evidence/preflight.json"\n'
text = text[:start] + replacement + text[end:]
old_sentence = 'The predecessor controller ${REJECTED_EXECUTOR_SHA} is rejected and cannot supply authority. Preflight verified that no predecessor run remained queued or active before the six read-only exact-head jobs were released. The v2 lane and integration jobs receive no write permission and persist no checkout credential.'
new_sentence = 'The predecessor controller ${REJECTED_EXECUTOR_SHA} is rejected and cannot supply authority. Preflight considered only the rejected executor workflow, verified that no such run remained queued or active, and required every observed predecessor run to end cancelled or failed before the six read-only exact-head jobs were released. The v2 lane and integration jobs receive no write permission and persist no checkout credential.'
if text.count(old_sentence) != 1:
    raise SystemExit("expected one predecessor body sentence")
text = text.replace(old_sentence, new_sentence)
if "`" in text:
    raise SystemExit("raw workflow backtick prohibited")
workflow.write_text(text)
helper_text = helper.read_text()
if helper_text.count('"adoption_efffect"') != 1:
    raise SystemExit("expected one misspelled adoption receipt key")
helper.write_text(helper_text.replace('"adoption_efffect"', '"adoption_effect"'))
expected = {
    workflow: "0ad7cd8ff349c2ade42c913309bff093f6ade33aeaa46aa3a093e15379de8df4",
    helper: "1bf2f8c5badaf98164c8bc0e92a1a208e9cdf4ded63132c628a27714fb21b5bd",
}
for path, digest in expected.items():
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != digest:
        raise SystemExit(f"{path}: SHA-256 {actual} != {digest}")
    print(f"{path} {actual}")
