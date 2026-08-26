#!/usr/bin/env bash
set -Eeuo pipefail

OUT=/tmp/star-trek-risik-claim-recovery-v2
RESULT_BRANCH=agent/star-trek-risik-claim-result-v2
RECEIPT_PATH=data/review/adapter-sdk/star-trek-risik-claim.json
MAIN=129e6f9c389fe61bb8027f4e046bea7de510cb84
MAIN_TREE=6d32c386636296e76bcab61baa387cb629967ac3
READBACK_BRANCH=agent/star-trek-morgo-terminal-readback-result-v4
READBACK_COMMIT=757e5951259be24f1f2caa1426e076065e6263b9
READBACK_PATH=transport/star-trek-morgo-terminal-readback-v4/terminal-readback.json
READBACK_SHA=4fc639304ca053f9d7a50e3e772fb3fc6a74cfcc564999fd434604b34db08e3c
FAILED_RUN=33021482811
TASK=ap_096624f177ae0c9f2e91836c
PERFORMER='Fred Tatasciore'
CHARACTER=Risik
FINGERPRINT=6a66df1f109bbe6f0cd679ab95e29d0090dc3f3139219a99daae82b3001f2cc6

rm -rf "$OUT"
mkdir -p "$OUT"
test -z "$(git ls-remote --heads origin "refs/heads/$RESULT_BRANCH")"

gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/$FAILED_RUN" > "$OUT/failed-run.json"
test "$(jq -r .status "$OUT/failed-run.json")" = completed
test "$(jq -r .conclusion "$OUT/failed-run.json")" = failure

git fetch --no-tags --depth=2 origin \
  "+refs/heads/main:refs/remotes/origin/main" \
  "+refs/heads/$READBACK_BRANCH:refs/remotes/origin/$READBACK_BRANCH"
test "$(git rev-parse refs/remotes/origin/main)" = "$MAIN"
test "$(git show -s --format=%T "$MAIN")" = "$MAIN_TREE"
test "$(git show -s --format=%s "$MAIN")" = 'Star Trek: publish Morgo cycle'
test "$(git rev-parse "refs/remotes/origin/$READBACK_BRANCH")" = "$READBACK_COMMIT"
git show "refs/remotes/origin/$READBACK_BRANCH:$READBACK_PATH" > "$OUT/morgo-terminal-readback.json"

export OUT MAIN MAIN_TREE READBACK_BRANCH READBACK_COMMIT READBACK_SHA TASK PERFORMER CHARACTER FINGERPRINT FAILED_RUN
python3 - <<'PY'
from pathlib import Path
import hashlib, json, os

def stable(v):
    if isinstance(v, dict): return {k: stable(v[k]) for k in sorted(v)}
    if isinstance(v, list): return [stable(x) for x in v]
    return v

p = Path(os.environ["OUT"]) / "morgo-terminal-readback.json"
r = json.loads(p.read_text())
b = dict(r)
identity = b.pop("attestation_sha256", None)
b.pop("artifact", None)
b.pop("recovery", None)
actual = hashlib.sha256((json.dumps(stable(b), indent=2, ensure_ascii=False) + "\n").encode()).hexdigest()
if identity != os.environ["READBACK_SHA"] or actual != identity:
    raise SystemExit(f"readback identity drifted: {identity}/{actual}")
candidate = (r.get("next") or {}).get("candidate") or {}
if (
    r.get("transaction") != "STAR-TREK-MORGO-TERMINAL-READBACK-V3"
    or r.get("verdict") != "pass"
    or r.get("canonical", {}).get("commit") != os.environ["MAIN"]
    or r.get("queue") != {"total":2228,"queued":1796,"resolved":430,"blocked":0,"rejected":2,"in_flight":0}
    or (r.get("next") or {}).get("phase") != "ready-for-one-cycle"
    or candidate.get("task_id") != os.environ["TASK"]
    or candidate.get("performer") != os.environ["PERFORMER"]
    or candidate.get("character") != os.environ["CHARACTER"]
    or candidate.get("source_fingerprint") != os.environ["FINGERPRINT"]
    or candidate.get("performance_modes") != ["voice-animation"]
):
    raise SystemExit("terminal predecessor or successor rail drifted")
boundary = r.get("boundary") or {}
if not (
    boundary.get("exact_head_deployment_complete") is True
    and boundary.get("queue_closed") is True
    and boundary.get("originating_lease_completed") is True
    and boundary.get("additional_lease_issued") is False
    and boundary.get("successor_claimed") is False
):
    raise SystemExit("Morgo terminal boundary is not claimable")
PY

git checkout --detach refs/remotes/origin/main
git clean -fdx
npm ci --ignore-scripts
node scripts/thesis-rails.mjs validate | tee "$OUT/thesis-before.log"
node scripts/thesis-rails.mjs next --json > "$OUT/rail.json"
jq -e --arg t "$TASK" --arg p "$PERFORMER" --arg c "$CHARACTER" --arg f "$FINGERPRINT" \
  '.phase=="ready-for-one-cycle" and .candidate.task_id==$t and .candidate.performer==$p
   and .candidate.character==$c and .candidate.source_fingerprint==$f
   and .candidate.performance_modes==["voice-animation"]' "$OUT/rail.json" >/dev/null

python3 - <<'PY'
from pathlib import Path
import json, os
s=json.loads(Path("data/AUTOPILOT.json").read_text())
trek=[x for x in s["jobs"] if x.get("scope")=="star-trek"]
task=next((x for x in trek if x.get("id")==os.environ["TASK"]),None)
active=[x for x in trek if x.get("status") in {"leased","drafted","merged"}]
counts={"total":len(trek),"queued":sum(x.get("status")=="queued" for x in trek),
"resolved":sum(x.get("status")=="resolved" for x in trek),"blocked":sum(x.get("status")=="blocked" for x in trek),
"rejected":sum(x.get("status")=="rejected" for x in trek),"in_flight":len(active)}
if counts!={"total":2228,"queued":1796,"resolved":430,"blocked":0,"rejected":2,"in_flight":0}:
    raise SystemExit(f"pre-claim queue drifted: {counts}")
if not task or task.get("status")!="queued" or task.get("attempts")!=0 or task.get("lease") is not None:
    raise SystemExit(f"Risik task is not pristine: {task}")
for k,e in [("performer",os.environ["PERFORMER"]),("character",os.environ["CHARACTER"]),("source_fingerprint",os.environ["FINGERPRINT"])]:
    if task.get(k)!=e: raise SystemExit(f"Risik {k} drifted")
if task.get("performance_modes")!=["voice-animation"]: raise SystemExit("Risik mode hint drifted")
Path(os.environ["OUT"],"pre.json").write_text(json.dumps({"task":task,"counts":counts},indent=2)+"\n")
PY

npm run autopilot -- next \
  --agent luna \
  --scope star-trek \
  --capability-profile text-vision \
  --task-id "$TASK" \
  --limit 1 \
  --selection-basis "Morgo terminal readback successor rail" \
  --out "$OUT/batch.json" \
  --prompt "$OUT/AUTOPILOT-PROMPT.md" \
  | tee "$OUT/autopilot-next.log"

jq -e --arg t "$TASK" --arg p "$PERFORMER" --arg c "$CHARACTER" --arg f "$FINGERPRINT" \
  '.selection.requested_task_id==$t and (.tasks|length)==1 and .tasks[0].id==$t
   and .tasks[0].performer==$p and .tasks[0].character==$c
   and .tasks[0].source_fingerprint==$f and .tasks[0].performance_modes==["voice-animation"]' \
  "$OUT/batch.json" >/dev/null

python3 - <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import hashlib, json, os

def stable(v):
    if isinstance(v,dict): return {k:stable(v[k]) for k in sorted(v)}
    if isinstance(v,list): return [stable(x) for x in v]
    return v

out=Path(os.environ["OUT"])
state=json.loads(Path("data/AUTOPILOT.json").read_text())
batch=json.loads((out/"batch.json").read_text())
before=json.loads((out/"pre.json").read_text())
rail=json.loads((out/"rail.json").read_text())
pred=json.loads((out/"morgo-terminal-readback.json").read_text())
trek=[x for x in state["jobs"] if x.get("scope")=="star-trek"]
task=next((x for x in trek if x.get("id")==os.environ["TASK"]),None)
active=[x for x in trek if x.get("status") in {"leased","drafted","merged"}]
counts={"total":len(trek),"queued":sum(x.get("status")=="queued" for x in trek),
"resolved":sum(x.get("status")=="resolved" for x in trek),"blocked":sum(x.get("status")=="blocked" for x in trek),
"rejected":sum(x.get("status")=="rejected" for x in trek),"in_flight":len(active)}
if counts!={"total":2228,"queued":1795,"resolved":430,"blocked":0,"rejected":2,"in_flight":1}:
    raise SystemExit(f"post-claim queue drifted: {counts}")
lease=(task or {}).get("lease")
if len(active)!=1 or active[0].get("id")!=os.environ["TASK"] or not lease or lease.get("id")!=batch.get("lease_id"):
    raise SystemExit(f"singular Risik lease not established: {task}")
receipt={
"version":2,"transaction":"STAR-TREK-RISIK-CLAIM-V2",
"generated_at":datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z"),
"canonical_parent":os.environ["MAIN"],"canonical_tree":os.environ["MAIN_TREE"],
"predecessor":{"transaction":pred["transaction"],"verdict":pred["verdict"],"branch":os.environ["READBACK_BRANCH"],
"commit":os.environ["READBACK_COMMIT"],"attestation_sha256":os.environ["READBACK_SHA"],
"canonical_commit":pred["canonical"]["commit"],"reviewed_cycle_id":pred["reviewed_cycle_id"]},
"recovery":{"failed_run_id":int(os.environ["FAILED_RUN"]),"classification":"native-selector-was-not-task-bound",
"failed_ephemeral_selection":{"task_id":"ap_3d10b7a97efdbdd11c50bc2a","performer":"Leonard Nimoy","character":"Henoch"},
"repair":"autopilot-next-task-id-bound-to-thesis-rail"},
"rail":rail,
"task":{"id":task["id"],"performer":task["performer"],"character":task["character"],
"source_fingerprint":task["source_fingerprint"],"performance_modes":task.get("performance_modes") or [],
"status":task["status"],"attempts":task["attempts"]},
"lease":lease,"batch":{"selection":batch.get("selection"),"readiness":batch.get("readiness"),
"sources":batch["tasks"][0].get("sources") or [],"source_receipts":batch["tasks"][0].get("source_receipts") or []},
"queue":{"before":before["counts"],"after":counts},
"changed_paths":["data/AUTOPILOT.json","data/journal/autopilot.jsonl"],
"source_boundary":{"source_revision_frozen":False,"independent_source_review_complete":False,
"performance_mode_adjudicated":False,"queued_mode_hint":task.get("performance_modes") or [],
"maker_attribution":"unresolved","transformation_measured":False},
"boundary":{"canonical_mutation":False,"product_staged":False,"additional_lease_issued":False,
"only_active_star_trek_task":task["id"],"source_review_pending":True,"media_review_pending":True,
"waterline_cycle_recorded":False}}
body=json.dumps(stable(receipt),indent=2,ensure_ascii=False)+"\n"
receipt["receipt_sha256"]=hashlib.sha256(body.encode()).hexdigest()
path=Path("data/review/adapter-sdk/star-trek-risik-claim.json")
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(stable(receipt),indent=2,ensure_ascii=False)+"\n")
(out/"claim-receipt.json").write_text(path.read_text())
(out/"post.json").write_text(json.dumps({"task":task,"counts":counts,"active":active},indent=2)+"\n")
PY

git diff --name-only "$MAIN" | LC_ALL=C sort > "$OUT/paths.txt"
printf '%s\n' data/AUTOPILOT.json data/journal/autopilot.jsonl "$RECEIPT_PATH" | LC_ALL=C sort > "$OUT/expected.txt"
diff -u "$OUT/expected.txt" "$OUT/paths.txt"
node scripts/validate.mjs | tee "$OUT/repository-validate.log"
node scripts/thesis-rails.mjs validate | tee "$OUT/thesis-after.log"
test "$(gh api "/repos/${GITHUB_REPOSITORY}/branches/main" --jq .commit.sha)" = "$MAIN"

git add data/AUTOPILOT.json data/journal/autopilot.jsonl "$RECEIPT_PATH"
git diff --cached --check
git config user.name undercast-risik-claim-v2
git config user.email undercast-risik-claim-v2@users.noreply.github.com
git commit -m 'Star Trek: claim Risik cycle v2'
test "$(git show -s --format=%P HEAD)" = "$MAIN"
git push origin "HEAD:refs/heads/$RESULT_BRANCH"
