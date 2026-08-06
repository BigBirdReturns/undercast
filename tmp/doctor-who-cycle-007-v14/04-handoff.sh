# Emit immutable, code-free publication handoff.
node --input-type=module <<'NODE'
import fs from 'node:fs';
import crypto from 'node:crypto';
const out = process.env.OUT;
const files = fs.readFileSync(`${out}/integrated-final-paths.txt`, 'utf8').trim().split(/\n/).filter(Boolean);
const hashes = {};
for (const file of files) hashes[file] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const handoff = {
  schema_version: 1,
  kind: 'doctor-who-cycle-007-current-main-product-v14',
  repository: process.env.GITHUB_REPOSITORY,
  run_id: Number(process.env.GITHUB_RUN_ID),
  run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  event_name: process.env.GITHUB_EVENT_NAME,
  carrier_head: process.env.HEAD_SHA,
  current_main: process.env.CURRENT_MAIN,
  reviewed_main: process.env.REVIEWED_MAIN,
  reviewed_candidate_commit: process.env.REVIEWED_CANDIDATE_COMMIT,
  reviewed_candidate_tree: process.env.REVIEWED_CANDIDATE_TREE,
  reviewed_lease_id: process.env.REVIEWED_LEASE_ID,
  independent_review_receipt_sha256: process.env.REVIEW_RECEIPT_SHA256,
  integrated_final_commit: fs.readFileSync(`${out}/integrated-final-commit.txt`, 'utf8').trim(),
  integrated_final_tree: fs.readFileSync(`${out}/integrated-final-tree.txt`, 'utf8').trim(),
  integrated_candidate_gate_sha256: fs.readFileSync(`${out}/integrated-candidate-gate.sha256`, 'utf8').trim(),
  final_gate_sha256: fs.readFileSync(`${out}/final-gate.sha256`, 'utf8').trim(),
  files: hashes,
  boundary: {repository_written: false, product_published: false, merge_authorized: false, eighth_lease_issued: false},
};
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const body = JSON.stringify(stable(handoff), null, 2) + '\n';
handoff.receipt_sha256 = crypto.createHash('sha256').update(body).digest('hex');
fs.writeFileSync(`${out}/publisher-handoff.json`, JSON.stringify(handoff, null, 2) + '\n');
NODE
test -z "$(git status --porcelain)"
