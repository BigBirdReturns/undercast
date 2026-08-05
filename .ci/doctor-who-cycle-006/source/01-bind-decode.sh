#!/usr/bin/env bash
set -euo pipefail
test "$(git rev-parse HEAD)" = "$AUTHORIZED_HEAD"
test -z "$(git status --porcelain)"
git config user.name undercast-estate-collector
git config user.email undercast-estate-collector@users.noreply.github.com
git fetch --no-tags origin \
  "refs/heads/main:refs/remotes/origin/main" \
  "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse refs/remotes/origin/${TARGET_BRANCH})" = "$AUTHORIZED_HEAD"

attested_main="3b07edf7768478dba1e94ddda8471748aef34e50"
exact_main="$(git rev-parse refs/remotes/origin/main)"
test -n "$exact_main"
git merge-base --is-ancestor "$attested_main" "$exact_main"
cat > /tmp/doctor-who-cycle-005-allowed-main-drift.txt <<'PATHS'
.github/workflows/apply-collection-mode.yml
.github/workflows/collection-policy.yml
.github/workflows/ux-02a-script-runner.yml
.github/workflows/validate.yml
data/MEDIA-SEARCH-LATEST.json
data/journal/media-search.jsonl
scripts/gate-fixtures.mjs
PATHS
sort -o /tmp/doctor-who-cycle-005-allowed-main-drift.txt /tmp/doctor-who-cycle-005-allowed-main-drift.txt
git diff --name-only "$attested_main".."$exact_main" | sort > /tmp/doctor-who-cycle-005-observed-main-drift.txt
comm -23 /tmp/doctor-who-cycle-005-observed-main-drift.txt /tmp/doctor-who-cycle-005-allowed-main-drift.txt > /tmp/doctor-who-cycle-005-unsafe-main-drift.txt
if test -s /tmp/doctor-who-cycle-005-unsafe-main-drift.txt; then
  echo 'unsafe mainline drift since the current-main preflight:' >&2
  cat /tmp/doctor-who-cycle-005-unsafe-main-drift.txt >&2
  exit 1
fi

export ATTESTED_MAIN="$attested_main"
export EXACT_MAIN="$exact_main"
echo "ATTESTED_MAIN=$ATTESTED_MAIN" >> "$GITHUB_ENV"
echo "EXACT_MAIN=$EXACT_MAIN" >> "$GITHUB_ENV"
cycle_at="$(git show -s --format=%cI "$AUTHORIZED_HEAD")"
test -n "$cycle_at"
export CYCLE_AT="$cycle_at"
echo "CYCLE_AT=$CYCLE_AT" >> "$GITHUB_ENV"

git rebase refs/remotes/origin/main
test "$(git merge-base HEAD refs/remotes/origin/main)" = "$exact_main"
shopt -s nullglob
parts=( "$TRANSPORT" "$TRANSPORT".part-* )
test "${#parts[@]}" -eq "$TRANSPORT_PARTS"
{
  printf '%s\n' "${parts[@]}"
  printf '%s\n' "$SELF"
} | sort > /tmp/expected-transport-paths.txt
git diff --name-only "$exact_main"...HEAD | sort > /tmp/actual-transport-paths.txt
diff -u /tmp/expected-transport-paths.txt /tmp/actual-transport-paths.txt

test -s /tmp/doctor-who-cycle-005-bootstrap.tgz
cp /tmp/doctor-who-cycle-005-bootstrap.tgz /tmp/doctor-who-cycle-005-transport.tgz
test "$(sha256sum /tmp/doctor-who-cycle-005-transport.tgz | awk '{print $1}')" = "$TRANSPORT_SHA256"
preflight_root="${PREFLIGHT_DIR:?PREFLIGHT_DIR is required}"
reattestation_root="${REATTESTATION_DIR:?REATTESTATION_DIR is required}"
for required in \
  "$preflight_root/exact-main.txt" \
  "$preflight_root/selected-task.json" \
  "$preflight_root/source-01.wikitext" \
  "$reattestation_root/exact-main.txt" \
  "$reattestation_root/verification.json" \
  "$reattestation_root/kaarsh-still-candidate.jpg"; do
  test -f "$required"
done
test "$(cat "$preflight_root/exact-main.txt")" = "$attested_main"
test "$(cat "$reattestation_root/exact-main.txt")" = "$attested_main"
test "$(sha256sum "$preflight_root/selected-task.json" | awk '{print $1}')" = "0b29e4cfa21d0fc848a7d3fe30531cf5a2e7ff3aa4d48c46713ed215716434c3"
test "$(sha256sum "$preflight_root/source-01.wikitext" | awk '{print $1}')" = "a656f352afef65b58a8945b08b0fbf869c6943a932125643cb60e236ff7cd3d4"
test "$(sha256sum "$reattestation_root/verification.json" | awk '{print $1}')" = "136f7d93b9c0e41a1e515aab9f6e122036e3f326e74e10bce42ffff7cc088bdc"
test "$(sha256sum "$reattestation_root/kaarsh-still-candidate.jpg" | awk '{print $1}')" = "ccf68328d7cbb9a84844b4693c0e3029fb1200d5869513b0ecf68d7228af0cad"
cp "$reattestation_root/kaarsh-still-candidate.jpg" "$CYCLE_ASSET_DIR/kaarsh-still-candidate.jpg"

node --input-type=module <<'NODE'
import fs from 'node:fs';
import crypto from 'node:crypto';
const preflightRoot = process.env.PREFLIGHT_DIR;
const reattestationRoot = process.env.REATTESTATION_DIR;
const assetDir = process.env.CYCLE_ASSET_DIR;
const attestedMain = process.env.ATTESTED_MAIN;
const exactMain = process.env.EXACT_MAIN;
const preflight = JSON.parse(fs.readFileSync(`${preflightRoot}/selected-task.json`, 'utf8'));
const reattested = JSON.parse(fs.readFileSync(`${reattestationRoot}/verification.json`, 'utf8'));
const observedText = fs.readFileSync('/tmp/doctor-who-cycle-005-observed-main-drift.txt', 'utf8').trim();
const allowedText = fs.readFileSync('/tmp/doctor-who-cycle-005-allowed-main-drift.txt', 'utf8').trim();
const observed = observedText ? observedText.split('\n') : [];
const allowed = allowedText ? allowedText.split('\n') : [];
const taskId = 'ap_ed7221a03fdd4679379e23f8';
const sourceFingerprint = 'ba3075acf7a348064e8e11359afa0ecc35fa231f8867e8c9496e101884366d43';
if (preflight.exact_main !== attestedMain || preflight.lease_issued !== false || preflight.selected?.task_id !== taskId || preflight.task?.status !== 'queued' || preflight.task?.source_fingerprint !== sourceFingerprint || preflight.queue?.queued !== 312 || preflight.queue?.resolved !== 4) throw new Error('current-main preflight custody drifted');
if (reattested.exact_main !== attestedMain || reattested.task_id !== taskId || reattested.performer !== 'Dan Starkey' || reattested.character !== 'Kaarsh' || reattested.source_fingerprint !== sourceFingerprint) throw new Error('Kaarsh re-attestation task drifted');
if (reattested.file_title !== 'File:Kaarsh.jpg' || reattested.file_page_id !== 91567 || reattested.source_sha256 !== 'e1300bbbea2f5bde0cfb6596b30e37f97018299bedf131514001e0ed996492da') throw new Error('Kaarsh re-attestation file custody drifted');
if (reattested.candidate?.sha256 !== 'ccf68328d7cbb9a84844b4693c0e3029fb1200d5869513b0ecf68d7228af0cad' || reattested.candidate?.width !== 640 || reattested.candidate?.height !== 373 || reattested.candidate?.bytes !== 41459) throw new Error('Kaarsh re-attestation candidate drifted');
if (reattested.boundary?.exact_file_named_by_revision_bound_source !== true || reattested.boundary?.generic_sontaran_substitution !== false || reattested.boundary?.candidate_adopted !== false || reattested.boundary?.lease_issued !== false || reattested.boundary?.repository_mutated !== false) throw new Error('Kaarsh re-attestation boundary drifted');
const normalized = {
  version: 3,
  exact_main: exactMain,
  attested_main: attestedMain,
  task_id: taskId,
  performer: reattested.performer,
  character: reattested.character,
  performance_mode: reattested.performance_modes,
  source_page: reattested.source_page,
  source_page_id: reattested.source_page_id,
  source_revision: reattested.source_revision,
  source_content_sha256: reattested.source_content_sha256,
  source_fingerprint: reattested.source_fingerprint,
  file_title: reattested.file_title,
  file_page_id: reattested.file_page_id,
  file_description_url: reattested.file_description_url,
  original_url: reattested.original_url,
  api_width: reattested.source_width,
  api_height: reattested.source_height,
  source_bytes: reattested.source_bytes,
  source_sha256: reattested.source_sha256,
  preflight_run: 30884868963,
  preflight_artifact: 'doctor-who-cycle-005-preflight-30884868963',
  preflight_artifact_id: 8882703065,
  preflight_artifact_sha256: 'bcf901d245e86e29dace2c3b890e6992948445f18d6e7abb6444413e31bb9d65',
  preflight_selection_sha256: '965ba891415af8329c436157361ec2dc0e43219e56471d9be0e887701a411ed7',
  reattestation_run: 30885200254,
  reattestation_job: 91914756059,
  reattestation_artifact: 'doctor-who-cycle-005-kaarsh-still-reattestation-30885200254',
  reattestation_artifact_id: 8882817870,
  reattestation_artifact_sha256: '36e441d5b56a8e0bff8d3932426e29c2f49d747d3bc4834917729a8fe1f34c4a',
  reattestation_json_sha256: '136f7d93b9c0e41a1e515aab9f6e122036e3f326e74e10bce42ffff7cc088bdc',
  candidate: reattested.candidate,
  visual_adjudication: reattested.visual_adjudication,
  main_drift: { policy: 'strict-path-allowlist', allowed_paths: allowed, observed_paths: observed },
  boundary: {
    exact_file_named_by_revision_bound_source: true,
    performer_identity_claim: false,
    generic_sontaran_substitution: false,
    candidate_adopted: false,
    lease_issued: false,
    repository_mutated: false,
    main_drift_allowlisted: true,
  },
};
const text = JSON.stringify(normalized, null, 2) + '\n';
fs.writeFileSync(`${assetDir}/kaarsh-still-verification.json`, text);
fs.writeFileSync('/tmp/doctor-who-cycle-005-normalized-verification.sha256', crypto.createHash('sha256').update(text).digest('hex') + '\n');
NODE

cat > /tmp/expected-transport-files.txt <<'FILES'
01-bind-decode.sh
02-materialize.sh
03-candidate-gate.sh
04-candidate-commit.sh
05-finalize.sh
06-final-gate-publish.sh
apply-doctor-who-cycle-005.mjs
apply-doctor-who-cycle-finalize-005.mjs
doctor-who-cycle-004-still-correction-composable.mjs
transport-manifest.json
FILES
tar -tzf /tmp/doctor-who-cycle-005-transport.tgz > /tmp/actual-transport-files.txt
diff -u /tmp/expected-transport-files.txt /tmp/actual-transport-files.txt
test "$(sha256sum "$MATERIALIZER" | awk '{print $1}')" = "7d2cbabf99248f0bcf8bc550f3d1aae18b5135ad19bb8508ddc98ac38661c415"
test "$(sha256sum "$FINALIZER" | awk '{print $1}')" = "6366db923f6288cb8b24554771a8485f251871b84e5b2d53b9a6ead359510ec7"
test "$(sha256sum "$CYCLE_ASSET_DIR/doctor-who-cycle-004-still-correction-composable.mjs" | awk '{print $1}')" = "31df003f52705fa94f74bf06158dfa8813752be4547d87593a664f1a0f3d88a4"
test "$(sha256sum "$CYCLE_ASSET_DIR/kaarsh-still-candidate.jpg" | awk '{print $1}')" = "ccf68328d7cbb9a84844b4693c0e3029fb1200d5869513b0ecf68d7228af0cad"
node --check "$MATERIALIZER"
node --check "$FINALIZER"
identify -format '%w %h\n' "$CYCLE_ASSET_DIR/kaarsh-still-candidate.jpg" > /tmp/doctor-who-cycle-005-prepared-still-dimensions.txt
test "$(cat /tmp/doctor-who-cycle-005-prepared-still-dimensions.txt)" = "640 373"
node --input-type=module <<'NODE'
import fs from 'node:fs';
import crypto from 'node:crypto';
const verification = JSON.parse(fs.readFileSync(`${process.env.CYCLE_ASSET_DIR}/kaarsh-still-verification.json`, 'utf8'));
if (verification.exact_main !== process.env.EXACT_MAIN || verification.attested_main !== process.env.ATTESTED_MAIN) throw new Error('normalized Kaarsh exact-main custody drifted');
if (verification.task_id !== 'ap_ed7221a03fdd4679379e23f8' || verification.performer !== 'Dan Starkey' || verification.character !== 'Kaarsh') throw new Error('normalized Kaarsh task drifted');
if (verification.reattestation_artifact_sha256 !== '36e441d5b56a8e0bff8d3932426e29c2f49d747d3bc4834917729a8fe1f34c4a' || verification.preflight_artifact_sha256 !== 'bcf901d245e86e29dace2c3b890e6992948445f18d6e7abb6444413e31bb9d65') throw new Error('normalized Kaarsh artifact custody drifted');
if (verification.main_drift?.policy !== 'strict-path-allowlist' || verification.boundary?.main_drift_allowlisted !== true) throw new Error('normalized Kaarsh drift policy missing');
const transport = JSON.parse(fs.readFileSync(`${process.env.CYCLE_ASSET_DIR}/transport-manifest.json`, 'utf8'));
if (transport.transaction !== 'DOCTOR-WHO-CYCLE-005-KAARSH' || transport.task_id !== 'ap_ed7221a03fdd4679379e23f8' || transport.attested_main !== process.env.ATTESTED_MAIN || transport.boundary?.one_task_maximum !== true || transport.boundary?.no_sixth_lease !== true || transport.boundary?.exact_character_still_required !== true || transport.boundary?.existing_portrait_reuse_forbidden !== true || transport.boundary?.self_delete_before_candidate_commit !== true || transport.boundary?.strict_main_drift_allowlist !== true) throw new Error('transport boundary drifted');
if (JSON.stringify(transport.safe_main_drift_paths) !== JSON.stringify(verification.main_drift?.allowed_paths)) throw new Error('transport safe main-drift allowlist drifted');
for (const entry of transport.files || []) {
  const path = `${process.env.CYCLE_ASSET_DIR}/${entry.path}`;
  const bytes = fs.readFileSync(path);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== entry.sha256 || bytes.length !== entry.bytes) throw new Error(`transport payload drifted: ${entry.path}`);
}
NODE

sha256sum \
  /tmp/doctor-who-cycle-005-transport.tgz \
  "$MATERIALIZER" \
  "$FINALIZER" \
  "$CYCLE_ASSET_DIR/doctor-who-cycle-004-still-correction-composable.mjs" \
  "$CYCLE_ASSET_DIR/kaarsh-still-candidate.jpg" \
  "$CYCLE_ASSET_DIR/kaarsh-still-verification.json" \
  "$CYCLE_ASSET_DIR/transport-manifest.json" \
  > /tmp/doctor-who-cycle-005-transport-sha256.txt
echo "attested_main=$attested_main" >> "$GITHUB_STEP_SUMMARY"
echo "exact_main=$exact_main" >> "$GITHUB_STEP_SUMMARY"
echo "observed_safe_drift_paths=$(wc -l < /tmp/doctor-who-cycle-005-observed-main-drift.txt)" >> "$GITHUB_STEP_SUMMARY"
echo "normalized_verification_sha256=$(cat /tmp/doctor-who-cycle-005-normalized-verification.sha256)" >> "$GITHUB_STEP_SUMMARY"
echo "rebased_launcher=$(git rev-parse HEAD)" >> "$GITHUB_STEP_SUMMARY"
echo "cycle_at=$cycle_at" >> "$GITHUB_STEP_SUMMARY"
