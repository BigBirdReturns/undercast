#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
TARGET_BRANCH="main"
MERGE_COMMIT="d8d02f20fdb6ff4d561908b3f5d2e1eb83a5aba2"
SITE_ROOT="https://bigbirdreturns.github.io/undercast"
RECEIPT="data/review/estate-debt/RELEASE-001-PAGES-LIVE-VERIFICATION.json"
FINALIZER_PR="${FINALIZER_PR_NUMBER:-0}"
SOURCE_PR="132"

fail() {
  echo "RELEASE-001 finalization failed: $*" >&2
  exit 1
}

remote_main() {
  git ls-remote origin "refs/heads/${TARGET_BRANCH}" | awk '{print $1}'
}

run_field() {
  local file="$1"
  local field="$2"
  node - "$file" "$field" <<'NODE'
const fs = require('fs');
const [file, field] = process.argv.slice(2);
const value = field.split('.').reduce((row, key) => row?.[key], JSON.parse(fs.readFileSync(file, 'utf8')));
if (value === undefined || value === null) process.exit(2);
process.stdout.write(String(value));
NODE
}

wait_for_active_preservation() {
  local active=""
  for _ in $(seq 1 240); do
    gh api "repos/${REPO}/actions/workflows/preserve.yml/runs?branch=${TARGET_BRANCH}&per_page=20" > /tmp/release-preserve-existing.json
    active="$(node - /tmp/release-preserve-existing.json <<'NODE'
const fs = require('fs');
const doc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const row = (doc.workflow_runs || []).find((run) => run.status !== 'completed');
if (row) process.stdout.write(String(row.id));
NODE
)"
    if [[ -z "$active" ]]; then
      return 0
    fi
    echo "waiting for existing preservation run ${active} to leave active state"
    sleep 15
  done
  fail "an existing preservation run did not quiesce"
}

dispatch_and_wait() {
  local workflow="$1"
  local expected_head="$2"
  local payload="$3"
  local label="$4"
  local marker
  local run_id=""
  local status=""
  local conclusion=""

  marker="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s' "$payload" | gh api --method POST \
    "repos/${REPO}/actions/workflows/${workflow}/dispatches" --input -

  for _ in $(seq 1 120); do
    gh api "repos/${REPO}/actions/workflows/${workflow}/runs?branch=${TARGET_BRANCH}&event=workflow_dispatch&per_page=50" \
      > "/tmp/release-${label}-runs.json"
    run_id="$(node - "/tmp/release-${label}-runs.json" "$expected_head" "$marker" <<'NODE'
const fs = require('fs');
const [file, expectedHead, marker] = process.argv.slice(2);
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const floor = Date.parse(marker) - 30_000;
const rows = (doc.workflow_runs || [])
  .filter((run) => run.head_sha === expectedHead && Date.parse(run.created_at) >= floor)
  .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
if (rows[0]) process.stdout.write(String(rows[0].id));
NODE
)"
    if [[ -n "$run_id" ]]; then
      break
    fi
    sleep 5
  done
  [[ -n "$run_id" ]] || fail "could not locate ${label} workflow run for ${expected_head}"

  for _ in $(seq 1 900); do
    gh api "repos/${REPO}/actions/runs/${run_id}" > "/tmp/release-${label}-run.json"
    status="$(run_field "/tmp/release-${label}-run.json" status)"
    conclusion="$(node - "/tmp/release-${label}-run.json" <<'NODE'
const fs = require('fs');
const doc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(doc.conclusion == null ? '' : String(doc.conclusion));
NODE
)"
    echo "${label} run ${run_id}: status=${status} conclusion=${conclusion:-pending}"
    if [[ "$status" == "completed" ]]; then
      [[ "$conclusion" == "success" ]] || fail "${label} run ${run_id} concluded ${conclusion}"
      LAST_RUN_ID="$run_id"
      export LAST_RUN_ID
      return 0
    fi
    sleep 20
  done
  fail "${label} run ${run_id} did not complete"
}

verify_live() {
  local output="$1"
  local receipt_sha="${2:-}"
  local snapshots_sha="${3:-}"
  SITE_ROOT="$SITE_ROOT" \
  RELEASE_RUN_ID="$GITHUB_RUN_ID" \
  EXPECTED_RECEIPT_SHA="$receipt_sha" \
  EXPECTED_SNAPSHOTS_SHA="$snapshots_sha" \
  node --input-type=module - "$output" <<'NODE'
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const output = process.argv[2];
const root = process.env.SITE_ROOT.replace(/\/$/, '');
const nonceBase = `${process.env.RELEASE_RUN_ID || 'release'}-${Date.now()}`;
const expectedReceiptSha = process.env.EXPECTED_RECEIPT_SHA || '';
const expectedSnapshotsSha = process.env.EXPECTED_SNAPSHOTS_SHA || '';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const items = [
  ['UC-178', 'still', 'images/uc-178-still-2d6360659016.jpg', '2d636065901653585e612634b51ab071abbee2a8cc74262061a42771ffcebc93'],
  ['UC-180', 'still', 'images/uc-180-still-a822b0f93820.jpg', 'a822b0f938209d0e9bab88174c4b690426fd7c50f5946f7410a3c0aedfeb8ed9'],
  ['UC-246', 'still', 'images/uc-246-still-8fbd07acbca9.jpg', '8fbd07acbca9f6d3a54c9298605ba305e42957b495a3e95d1022701c049a9e30'],
  ['UC-250', 'still', 'images/uc-250-still-dc677dbabf75.jpg', 'dc677dbabf7566779f1ba80bb4bab29b24ac66b894079041687ef9436de9f497'],
  ['UC-277', 'still', 'images/uc-277-still-9816923c2843.jpg', '9816923c2843a31d6de3ba5fd2a09035261d6c6b1c8f7276a7f9ee5fb687b522'],
  ['UC-283', 'still', 'images/uc-283-still-12ecff4901da.jpg', '12ecff4901dad96cbf803051f9b8e60c5d33fcb890218fa7ee1eec9458736d50'],
  ['UC-290', 'still', 'images/uc-290-still-fb8537fa1294.jpg', 'fb8537fa12949e3300873404ba2b35da0f72f5ed0691875a10da1c02cdf5ee7f'],
  ['UC-684', 'portrait', 'images/uc-684-portrait-1a2d9a32dbbc.jpg', '1a2d9a32dbbc05fdba1e4ba6fbfea7dd1b619c1f01a8f0f9f7383f64d54f579c'],
  ['UC-1092', 'portrait', 'images/uc-1092-portrait-5c73e975be5b.jpg', '5c73e975be5ba36ed295422f0c789a10a1017886759769590907c2c6171b6933'],
].map(([record_id, side, path, hash]) => ({ record_id, side, path, sha256: hash }));

async function fetchPath(path, attempt = 0) {
  const join = path.includes('?') ? '&' : '?';
  const url = `${root}/${path}${join}release_verify=${encodeURIComponent(`${nonceBase}-${attempt}`)}`;
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'cache-control': 'no-cache, no-store, max-age=0',
      pragma: 'no-cache',
      'user-agent': 'UNDERCAST-RELEASE-001',
    },
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    path,
    url: `${root}/${path}`,
    status: response.status,
    content_type: response.headers.get('content-type'),
    etag: response.headers.get('etag'),
    last_modified: response.headers.get('last-modified'),
    cache_control: response.headers.get('cache-control'),
    bytes: bytes.length,
    sha256: sha256(bytes),
    body: bytes,
  };
}

async function waitForQuality() {
  let lastError = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const result = await fetchPath('data/quality.json', attempt);
      const doc = JSON.parse(result.body.toString('utf8'));
      const metrics = doc.metrics || {};
      if (
        doc.total === 1313 &&
        metrics.complete_pairs === 740 &&
        metrics.complete_pair_ratio === 0.563595 &&
        metrics.missing_still === 332 &&
        metrics.missing_portrait === 348 &&
        metrics.missing_both === 107
      ) {
        return { result, doc };
      }
      lastError = new Error(`quality state is ${JSON.stringify({ total: doc.total, metrics })}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(10_000);
  }
  throw lastError || new Error('quality state never became current');
}

const quality = await waitForQuality();
const [specimensResult, sourcesResult, indexResult] = await Promise.all([
  fetchPath('data/specimens.json'),
  fetchPath('data/SOURCES.json'),
  fetchPath('index.html'),
]);
const specimens = JSON.parse(specimensResult.body.toString('utf8'));
const sources = JSON.parse(sourcesResult.body.toString('utf8'));
if (!indexResult.body.toString('utf8').includes('UNDERCAST')) throw new Error('live index lacks UNDERCAST identity');
const sourceById = new Map(sources.map((row) => [row.id, row]));
const checked = [];
for (const item of items) {
  const specimen = specimens.find((row) => row.id === item.record_id);
  const source = sourceById.get(item.record_id);
  if (!specimen || !source) throw new Error(`${item.record_id}: canonical rows missing live`);
  const left = specimen[item.side];
  const right = source[item.side];
  if (!left || !right || JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${item.record_id}/${item.side}: live canonical rows disagree`);
  if (left.src !== item.path) throw new Error(`${item.record_id}/${item.side}: live path ${left.src} != ${item.path}`);
  const [image, record] = await Promise.all([
    fetchPath(item.path),
    fetchPath(`records/${item.record_id}/index.html`),
  ]);
  if (image.sha256 !== item.sha256) throw new Error(`${item.record_id}/${item.side}: live SHA-256 drifted`);
  const recordText = record.body.toString('utf8');
  if (!recordText.includes(item.record_id) || !recordText.includes(item.path)) throw new Error(`${item.record_id}: permanent record does not bind expected media`);
  checked.push({
    obligation_id: `${item.record_id}/${item.side}`,
    canonical_binding: left,
    image: { ...image, body: undefined },
    permanent_record: { ...record, body: undefined },
  });
}

let receipt = null;
if (expectedReceiptSha) {
  const result = await fetchPath('data/review/estate-debt/RELEASE-001-PAGES-LIVE-VERIFICATION.json');
  if (result.sha256 !== expectedReceiptSha) throw new Error(`live release receipt SHA ${result.sha256} != ${expectedReceiptSha}`);
  receipt = { ...result, body: undefined };
}
let snapshots = null;
if (expectedSnapshotsSha) {
  const result = await fetchPath('preservation/SNAPSHOTS.json');
  if (result.sha256 !== expectedSnapshotsSha) throw new Error(`live preservation registry SHA ${result.sha256} != ${expectedSnapshotsSha}`);
  snapshots = { ...result, body: undefined };
}

const report = {
  version: 1,
  transaction: 'RELEASE-001',
  operation: 'github-pages-live-observation',
  status: 'pass',
  observed_at: new Date().toISOString(),
  site_root: root,
  quality: {
    document: quality.doc,
    response: { ...quality.result, body: undefined },
  },
  index: { ...indexResult, body: undefined },
  specimens: { ...specimensResult, body: undefined },
  sources: { ...sourcesResult, body: undefined },
  obligations: checked,
  receipt,
  preservation_registry: snapshots,
};
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  status: report.status,
  observed_at: report.observed_at,
  complete_pairs: report.quality.document.metrics.complete_pairs,
  obligations: report.obligations.length,
  receipt_verified: Boolean(receipt),
  preservation_registry_verified: Boolean(snapshots),
}, null, 2));
NODE
}

wait_for_active_preservation

test "$(git rev-parse HEAD)" = "$AUTHORIZED_HEAD" || fail "finalizer checkout drifted"
git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
BASE_HEAD="$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")"
git merge-base --is-ancestor "$MERGE_COMMIT" "$BASE_HEAD" || fail "main no longer descends from the estate merge"

git checkout --detach "$BASE_HEAD"
test -z "$(git status --porcelain)" || fail "main checkout is dirty"
node scripts/estate-canonical-adoption-ledger.mjs > /tmp/RELEASE-001-adoption-ledger.json

# Explicitly deploy the exact current main head so the live observation is tied to
# a workflow run rather than inferred from an earlier push.
dispatch_and_wait \
  "pages.yml" \
  "$BASE_HEAD" \
  "{\"ref\":\"${TARGET_BRANCH}\"}" \
  "pages-base"
BASE_PAGES_RUN="$LAST_RUN_ID"
verify_live /tmp/RELEASE-001-live-base.json

[[ ! -e "$RECEIPT" ]] || fail "$RECEIPT already exists"
BASE_HEAD="$BASE_HEAD" \
BASE_PAGES_RUN="$BASE_PAGES_RUN" \
MERGE_COMMIT="$MERGE_COMMIT" \
RECEIPT="$RECEIPT" \
node --input-type=module - <<'NODE_RECEIPT'
import fs from 'node:fs';
import path from 'node:path';
const observation = JSON.parse(fs.readFileSync('/tmp/RELEASE-001-live-base.json', 'utf8'));
const ledger = JSON.parse(fs.readFileSync('/tmp/RELEASE-001-adoption-ledger.json', 'utf8'));
const doc = {
  version: 1,
  transaction: 'RELEASE-001',
  operation: 'estate-consolidation-pages-live-verification',
  status: 'live-verified',
  recorded_at: new Date().toISOString(),
  authorization: {
    merged_pull_request: 132,
    merge_commit: process.env.MERGE_COMMIT,
    verified_main_head: process.env.BASE_HEAD,
    pages_workflow_run: Number(process.env.BASE_PAGES_RUN),
    finalizer_workflow_run: Number(process.env.GITHUB_RUN_ID),
    finalizer_source_head: process.env.AUTHORIZED_HEAD,
  },
  canonical: {
    total_records: 1313,
    complete_pairs: 740,
    complete_pair_ratio: 0.563595,
    missing_stills: 332,
    missing_portraits: 348,
    missing_both: 107,
    imported_packet_obligations: 55,
    direct_only_obligations: 9,
    bounded_estate_remaining: 0,
    canonical_media_improvements: 64,
    adoption_ledger: ledger,
  },
  live_observation: observation,
  durable_authority: [
    'data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json',
    'data/review/estate-debt/COLLECT-013-CANONICAL-ADOPTION.json',
    'data/review/estate-debt/COLLECT-013-PUBLICATION.json',
    'data/review/estate-debt/COLLECT-014-CANONICAL-ADOPTION.json',
    'data/review/estate-debt/COLLECT-014-PUBLICATION.json',
  ],
  boundary: {
    canonical_mutation: false,
    quality_baseline_reset: false,
    source_branch_merged: false,
    complete_bounded_estate: true,
    exact_pages_run_verified: true,
    preservation_snapshot_required_next: true,
  },
};
fs.mkdirSync(path.dirname(process.env.RECEIPT), { recursive: true });
fs.writeFileSync(process.env.RECEIPT, `${JSON.stringify(doc, null, 2)}\n`);
NODE_RECEIPT

git add -- "$RECEIPT"
git diff --cached --check
npm run gate
test -z "$(git diff --name-only)" || fail "unstaged drift exists after receipt gate"
test -z "$(git ls-files --others --exclude-standard)" || fail "untracked drift exists after receipt gate"
RECEIPT_TREE="$(git write-tree)"

git config user.name "undercast-release"
git config user.email "undercast-release@users.noreply.github.com"
git commit \
  -m "Release: record exact Pages verification for estate consolidation" \
  -m "transaction=RELEASE-001" \
  -m "verified_main_head=${BASE_HEAD}" \
  -m "verified_pages_run=${BASE_PAGES_RUN}" \
  -m "complete_pairs=740" \
  -m "bounded_estate_remaining=0" \
  -m "receipt_tree=${RECEIPT_TREE}" \
  -m "finalizer_workflow_run=${GITHUB_RUN_ID}"
RECEIPT_HEAD="$(git rev-parse HEAD)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${BASE_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

# Deploy and verify the receipt-bearing main head itself.
dispatch_and_wait \
  "pages.yml" \
  "$RECEIPT_HEAD" \
  "{\"ref\":\"${TARGET_BRANCH}\"}" \
  "pages-receipt"
RECEIPT_PAGES_RUN="$LAST_RUN_ID"
RECEIPT_SHA="$(sha256sum "$RECEIPT" | awk '{print $1}')"
verify_live /tmp/RELEASE-001-live-receipt.json "$RECEIPT_SHA"

CURRENT_MAIN="$(remote_main)"
[[ "$CURRENT_MAIN" == "$RECEIPT_HEAD" ]] || fail "main advanced before preservation dispatch: ${CURRENT_MAIN}"

dispatch_and_wait \
  "preserve.yml" \
  "$RECEIPT_HEAD" \
  "{\"ref\":\"${TARGET_BRANCH}\",\"inputs\":{\"full_originals\":\"false\"}}" \
  "preservation"
PRESERVATION_RUN="$LAST_RUN_ID"

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
PRESERVED_HEAD="$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")"
git merge-base --is-ancestor "$RECEIPT_HEAD" "$PRESERVED_HEAD" || fail "preservation head does not descend from the verified receipt head"
git show "${PRESERVED_HEAD}:preservation/SNAPSHOTS.json" > /tmp/RELEASE-001-SNAPSHOTS.json

RECEIPT_HEAD="$RECEIPT_HEAD" \
PRESERVED_HEAD="$PRESERVED_HEAD" \
PRESERVATION_RUN="$PRESERVATION_RUN" \
node --input-type=module - <<'NODE_PRESERVATION'
import fs from 'node:fs';
const doc = JSON.parse(fs.readFileSync('/tmp/RELEASE-001-SNAPSHOTS.json', 'utf8'));
const rows = (doc.snapshots || []).filter((row) => row.repository_commit === process.env.RECEIPT_HEAD);
if (rows.length !== 1) throw new Error(`expected one snapshot for ${process.env.RECEIPT_HEAD}, found ${rows.length}`);
const snapshot = rows[0];
if (!snapshot.public_release?.tag || !Array.isArray(snapshot.public_release?.assets) || snapshot.public_release.assets.length < 2) {
  throw new Error('preservation snapshot lacks public release custody');
}
const report = {
  version: 1,
  transaction: 'RELEASE-001',
  operation: 'post-release-preservation-observation',
  status: 'pass',
  observed_at: new Date().toISOString(),
  receipt_head: process.env.RECEIPT_HEAD,
  preservation_commit: process.env.PRESERVED_HEAD,
  preservation_workflow_run: Number(process.env.PRESERVATION_RUN),
  snapshot,
};
fs.writeFileSync('/tmp/RELEASE-001-preservation.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  status: report.status,
  snapshot_id: snapshot.id,
  snapshot_status: snapshot.status,
  public_assets: snapshot.public_release.assets.length,
}, null, 2));
NODE_PRESERVATION

# Publish the preservation receipt commit and verify its exact bytes live.
dispatch_and_wait \
  "pages.yml" \
  "$PRESERVED_HEAD" \
  "{\"ref\":\"${TARGET_BRANCH}\"}" \
  "pages-preserved"
PRESERVED_PAGES_RUN="$LAST_RUN_ID"
SNAPSHOTS_SHA="$(sha256sum /tmp/RELEASE-001-SNAPSHOTS.json | awk '{print $1}')"
verify_live /tmp/RELEASE-001-live-preserved.json "$RECEIPT_SHA" "$SNAPSHOTS_SHA"

SNAPSHOT_ID="$(node -p "require('/tmp/RELEASE-001-preservation.json').snapshot.id")"
SNAPSHOT_STATUS="$(node -p "require('/tmp/RELEASE-001-preservation.json').snapshot.status")"
SNAPSHOT_TAG="$(node -p "require('/tmp/RELEASE-001-preservation.json').snapshot.public_release.tag")"

cat > /tmp/RELEASE-001-final.txt <<EOF_FINAL
RELEASE-001 closed the estate-consolidation release loop.

\`\`\`text
merge commit:                 ${MERGE_COMMIT}
verified product head:         ${BASE_HEAD}
base Pages run:                ${BASE_PAGES_RUN}
live-verification receipt:     ${RECEIPT_HEAD}
receipt Pages run:             ${RECEIPT_PAGES_RUN}
preservation workflow run:     ${PRESERVATION_RUN}
preservation receipt head:     ${PRESERVED_HEAD}
preserved-head Pages run:      ${PRESERVED_PAGES_RUN}
preservation snapshot:         ${SNAPSHOT_ID}
snapshot status:               ${SNAPSHOT_STATUS}
public release tag:            ${SNAPSHOT_TAG}
complete pairs:                740 / 1,313
bounded estate remaining:      0
live direct-only objects:      9 / 9
\`\`\`

The exact current main lineage was explicitly deployed through the Pages workflow, the live quality ledger and all nine direct-only canonical objects were fetched and hash-verified, the committed live-verification receipt was fetched back from Pages byte-for-byte, and the preservation registry commit was then deployed and fetched back byte-for-byte. The source PRs remained closed unmerged, the quality baseline was not reset, and no canonical mutation occurred during release verification.
EOF_FINAL

gh pr comment "$SOURCE_PR" --repo "$REPO" --body-file /tmp/RELEASE-001-final.txt
if [[ "$FINALIZER_PR" != "0" ]]; then
  gh pr comment "$FINALIZER_PR" --repo "$REPO" --body-file /tmp/RELEASE-001-final.txt
fi

gh api --method POST "repos/${REPO}/statuses/${PRESERVED_HEAD}" \
  -f state=success \
  -f context=estate-release-finalize \
  -f description="Pages live verification and preservation snapshot passed"

node --input-type=module - <<NODE_FINAL
import fs from 'node:fs';
const report = {
  version: 1,
  transaction: 'RELEASE-001',
  status: 'complete',
  merge_commit: '${MERGE_COMMIT}',
  verified_product_head: '${BASE_HEAD}',
  base_pages_run: Number('${BASE_PAGES_RUN}'),
  receipt_head: '${RECEIPT_HEAD}',
  receipt_pages_run: Number('${RECEIPT_PAGES_RUN}'),
  preservation_run: Number('${PRESERVATION_RUN}'),
  preserved_head: '${PRESERVED_HEAD}',
  preserved_pages_run: Number('${PRESERVED_PAGES_RUN}'),
  snapshot_id: '${SNAPSHOT_ID}',
  snapshot_status: '${SNAPSHOT_STATUS}',
  snapshot_tag: '${SNAPSHOT_TAG}',
  live_receipt_sha256: '${RECEIPT_SHA}',
  live_snapshots_sha256: '${SNAPSHOTS_SHA}',
};
fs.writeFileSync('/tmp/RELEASE-001-final.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
NODE_FINAL
