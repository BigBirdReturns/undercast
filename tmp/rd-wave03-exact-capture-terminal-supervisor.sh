#!/usr/bin/env bash
set -euo pipefail

repo="${REPO_ROOT:?REPO_ROOT is required}"
artifacts="${ARTIFACT_ROOT:?ARTIFACT_ROOT is required}"
base="${PRODUCT_BASE:?PRODUCT_BASE is required}"
worktree="${PRODUCT_WORKTREE:?PRODUCT_WORKTREE is required}"
evidence="${EVIDENCE:?EVIDENCE is required}"
source_branch=agent/ssc-rd-wave03-exact-capture-materializer-20260805
source_path=tmp/rd-wave03-exact-capture-materialize.py
mkdir -p "$evidence"

# Recover the reviewed generator and repair the two order-sensitive map
# comparisons without changing any count, route, object, or authority field.
git -C "$repo" fetch --no-tags origin "+refs/heads/${source_branch}:refs/remotes/origin/${source_branch}"
source_head="$(git -C "$repo" rev-parse "refs/remotes/origin/${source_branch}")"
git -C "$repo" show "${source_head}:${source_path}" > "$evidence/materializer.py"
python3 - "$evidence/materializer.py" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1])
text=path.read_text()
replacements=[
(
"assert(JSON.stringify(refusals) === JSON.stringify(EXPECTED_REFUSALS), 'refusal denominator changed');",
"for (const [key, count] of Object.entries(EXPECTED_REFUSALS)) assert(refusals[key] === count, `refusal denominator changed for ${key}`); assert(Object.keys(refusals).length === Object.keys(EXPECTED_REFUSALS).length, 'unexpected refusal class');"
),
(
"assert(JSON.stringify(protocol.selection.refusal_counts) === JSON.stringify(EXPECTED_REFUSALS), 'protocol refusal counts changed');",
"for (const [key, count] of Object.entries(EXPECTED_REFUSALS)) assert(protocol.selection.refusal_counts[key] === count, `protocol refusal count changed for ${key}`); assert(Object.keys(protocol.selection.refusal_counts).length === Object.keys(EXPECTED_REFUSALS).length, 'unexpected protocol refusal class');"
),
]
for old,new in replacements:
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'expected one serializer-sensitive assertion, found {count}: {old}')
    text=text.replace(old,new,1)
path.write_text(text)
PY
python3 -m py_compile "$evidence/materializer.py"
printf 'source_branch=%s\nsource_head=%s\nsource_path=%s\nsource_blob=%s\nsource_sha256=%s\nsemantic_repairs=2\n' \
  "$source_branch" "$source_head" "$source_path" \
  "$(git hash-object "$evidence/materializer.py")" \
  "$(sha256sum "$evidence/materializer.py" | awk '{print $1}')" \
  > "$evidence/materializer-source.txt"

python3 "$evidence/materializer.py" \
  --repo "$repo" \
  --artifacts "$artifacts" \
  --base "$base" \
  --worktree "$worktree" \
  --evidence "$evidence"

cat > "$evidence/capture-current.mjs" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [rootArg, outArg] = process.argv.slice(2);
if (!rootArg || !outArg) throw new Error('usage: capture-current.mjs ROOT OUT');
const root = path.resolve(rootArg);
const out = path.resolve(outArg);
const modulePath = path.join(root, 'scripts/rd-wave03-exact-capture.mjs');
const { derivePlan, stableJson } = await import(pathToFileURL(modulePath).href);
const plan = derivePlan(root);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function normalizedHost(value) {
  const host = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
  return host.startsWith('www.') ? host.slice(4) : host;
}
async function readBounded(response, maximum) {
  if (!response.body) throw new Error('response body missing');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) {
      await reader.cancel('maximum body exceeded');
      throw new Error(`body limit exceeded at ${bytes} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
async function captureOne(object) {
  const started_at = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), plan.request_policy.timeout_ms);
  try {
    const response = await fetch(object.requested_url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/json,application/pdf;q=0.9,*/*;q=0.1',
        'user-agent': 'UnderCast-RD-W03-terminal-supervisor'
      }
    });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    const final_url = response.url || object.requested_url;
    if (normalizedHost(final_url) !== object.allowed_final_host) {
      throw new Error(`unexpected final host ${normalizedHost(final_url)} != ${object.allowed_final_host}`);
    }
    const body = await readBounded(response, plan.request_policy.maximum_body_bytes);
    const current_body_sha256 = sha256(body);
    const relative_path = `objects/${object.route_id}.bin`;
    const target = path.join(out, relative_path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    return {
      ok: true,
      object_id: object.object_id,
      route_id: object.route_id,
      lane_id: object.lane_id,
      unit_id: object.unit_id,
      event_class: object.event_class,
      cell_id: object.cell_id,
      requested_url: object.requested_url,
      final_url,
      http_status: response.status,
      content_type: response.headers.get('content-type'),
      initial_bytes: object.initial_bytes,
      initial_body_sha256: object.initial_body_sha256,
      current_bytes: body.length,
      current_body_sha256,
      body_drift: body.length !== object.initial_bytes || current_body_sha256 !== object.initial_body_sha256,
      relative_path,
      started_at,
      finished_at: new Date().toISOString(),
      attempt_count: 1,
      chronology_status: 'unresolved',
      evidence_admitted: false,
      classes_closed: 0
    };
  } catch (error) {
    return {
      ok: false,
      object_id: object.object_id,
      route_id: object.route_id,
      requested_url: object.requested_url,
      error_class: error?.name || 'Error',
      error_message: String(error?.message || error),
      started_at,
      finished_at: new Date().toISOString(),
      attempt_count: 1,
      chronology_status: 'unresolved',
      evidence_admitted: false,
      classes_closed: 0
    };
  } finally {
    clearTimeout(timer);
  }
}
const results = new Array(plan.objects.length);
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= plan.objects.length) return;
    results[index] = await captureOne(plan.objects[index]);
  }
}
await Promise.all(Array.from({ length: plan.request_policy.concurrency }, () => worker()));
const receipt = {
  schema_version: 1,
  transaction_id: 'RD-W03-EXACT-CAPTURE-CURRENT-01',
  source_product_head: process.env.PRODUCT_HEAD || null,
  supervisor_run_id: process.env.GITHUB_RUN_ID || null,
  started_at: results[0]?.started_at || new Date().toISOString(),
  finished_at: new Date().toISOString(),
  route_count: results.length,
  objects: results,
  summary: {
    successful: results.filter(row => row.ok).length,
    failed: results.filter(row => !row.ok).length,
    unchanged: results.filter(row => row.ok && !row.body_drift).length,
    drifted: results.filter(row => row.ok && row.body_drift).length,
    evidence_admissions: 0,
    chronology_resolved: 0,
    classes_closed: 0
  },
  authority: {
    external_contacts: 0,
    external_reviews: 0,
    outside_human_dependency: false,
    publication_effect: 'none',
    adoption_effect: 'none',
    graph_effect: 'none',
    merge_authority: false
  }
};
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'current-capture-receipt.json'), stableJson(receipt));
if (receipt.summary.failed) throw new Error(`${receipt.summary.failed} exact-capture transport failures`);
NODE
node --check "$evidence/capture-current.mjs"
