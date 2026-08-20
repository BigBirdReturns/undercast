from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess

REPO = Path(os.environ.get("REPO_ROOT", "."))
ART = Path(os.environ.get("ARTIFACT_ROOT", "/tmp/kukulkan-terminal-artifacts"))
OUT = Path(os.environ.get("OUTPUT_ROOT", "/tmp/kukulkan-terminal-execution"))

PRODUCT_COMMIT = "47296e8a7947384b04275962b8f6a125e5306680"
PRODUCT_TREE = "8594a496bbbeeabc73c883c2c2052949574f5316"
CANONICAL_PARENT = "af8c0891b38275889bc90ca76af763ce6dd9b59c"
TASK_ID = "ap_8aa8780eda59987cb5a1de36"
TASK_FINGERPRINT = "77f5acaf275c3880b0f0139d0726789eefeff1cf7de1710f00e9d1bca4427b9c"
WALL_ID = "UC-1390"
CYCLE_RECEIPT_IDENTITY = "3ed6430657a022c09598330dfce14030bf234dadc6af002358251f630c7b897b"
CYCLE_FILE_SHA = "30f885cf87b5082ff538ebcbdcf0c9825359b6b90b2ee40f9e50c29f1c4ea840"
CHECKER_SHA = "cfe5b5700fc2e0ac65cebb22285e315b9139ca1571a51cfb0591a832c37c849a"
SOURCE_RECEIPT_IDENTITY = "8bd855653a81825dafe71625d0efd5bae08f6cffe69f72e68dce145f541c6fef"
PREPARATION_FACETS_SHA = "08ab416504ed4e8123fbbb0768202b9de333a0a326026f6e367363407ec394a1"
CANONICAL_FACETS_SHA = "5eb4148f2b4a3dc9b1f8576f27cbc8cba57eedffabbea6d519854b7eb0a6efad"
STILL_SHA = "1b5ea8e3828008fa85be15aea04fb94d43ba8630f286ec3567e0fb47d419ecfc"
PORTRAIT_SHA = "0f77a999b33ee7bd9aeb1a22ab4eb29283bfb185c15f76b4712352606a49e94c"
CANDIDATE_COMMIT = "2453707296e9848ee60e5c22ad336354453a97f3"
CANDIDATE_TREE = "32be3ba8866cf48b6302d345fe2ba07696ff29e0"
CANDIDATE_PATH_SHA = "7433cc3f43aaf5080b2a0ff8ff756ab40e45e39573559b2b6b6714f8bb2f5361"
PRODUCT_PATH_SHA = "5633dae527ac01c87e68d6eedf274c542836221306b225ee451fd31dbab7342a"
STAGE_RECEIPT_SHA = "4842c3fee689fd03ea2d6af7a2459162ada152e0be8ce6615584c662e7c4d2c4"
REVIEW_FILE_SHA = "cfb2533e59855ba7482493e07b330dc72357d16a9f821c774af45a4d6f3abf27"
REVIEW_IDENTITY = "8e8ab4510cfb20b9d9e141692cdff173332a31568d93e556e62f265d9c77063a"
SEALED_CONTROLLER_MANIFEST_SHA = "cbcf44997e3a4989edc9bb2ae152a6e6e9c4d34bc3a9d556868c84d04032c3ec"
EXECUTION_REBINDING_IDENTITY = "202c539d1f309fda9022ebc365852a8ffad03276a9b7dd9a14dd7f57fd82baf5"
PAGES_RUN = 32320701427
PUBLICATION_RUN = 32320408106
PUBLICATION_JOB = 96281315695
PROBE_RUN = 32319707151
PROBE_JOB = 96279260416

ARTIFACTS = {
    "probe_receipt": {
        "id": 9389338360,
        "name": "star-trek-kukulkan-probe-v6",
        "run": PROBE_RUN,
        "sha256": "c709e51abea1ee40abee0c372ae07120d952eae6cbea8738ab24ca5e3c2905f4",
    },
    "media_preparation": {
        "id": 9389336811,
        "name": "star-trek-kukulkan-media-v6",
        "run": PROBE_RUN,
        "sha256": "f3451597601f150334c405b0cf5f336e46b6f796097c9e1711fe2703975ed100",
    },
    "sealed_controller": {
        "id": 9389337488,
        "name": "star-trek-kukulkan-controller-source-v6",
        "run": PROBE_RUN,
        "sha256": "78d21efa06301f3bd8a47f976d7a25f0f5d4816a5cbca2dcc3dd650cdb7f73b6",
    },
    "execution_controller": {
        "id": 9389559695,
        "name": "star-trek-kukulkan-controller-execution-v1",
        "run": PUBLICATION_RUN,
        "sha256": "549b8d37c3fc780ed59d0fa94e185341f306f3c95c8148f78c61681326766e67",
    },
    "candidate": {
        "id": 9389573196,
        "name": "unitkukulkan-candidate-product",
        "run": PUBLICATION_RUN,
        "sha256": "6de03cbecbd3a0ad9865961b29855172820ccf65d05763defe99619b21c3bff4",
    },
    "independent_review": {
        "id": 9389575246,
        "name": "unitkukulkan-independent-review",
        "run": PUBLICATION_RUN,
        "sha256": "5fe1c187467e8c54a6586c5050334543f17a6a6ea7675e0ba0e5c81629f9f693",
    },
    "final_product_receipt": {
        "id": 9389667915,
        "name": "star-trek-kukulkan-final-product-receipt-v1",
        "run": PUBLICATION_RUN,
        "sha256": "6cef592cb9f059910c26c9696de38a7f9bda88c942834ceec07012031ecb8938",
    },
}

FINALIZATION_PATHS = {
    "data/ESTATE-REGISTRY.json",
    "data/WATERLINE-STATE.json",
    "data/journal/waterline.jsonl",
    "data/review/adapter-sdk/BASELINE.json",
    "data/review/adapter-sdk/star-trek-kukulkan-cycle.json",
    "package.json",
    "scripts/star-trek-kukulkan-cycle.mjs",
}


def fail(message: str) -> None:
    raise SystemExit(message)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path):
    return json.loads(path.read_text())


def one(root: Path, name: str) -> Path:
    rows = list(root.rglob(name))
    if len(rows) != 1:
        fail(f"{name}: expected exactly one file below {root}, found {rows}")
    return rows[0]


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def pretty_identity(value: dict) -> str:
    payload = json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"
    return hashlib.sha256(payload.encode()).hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def exact(value, expected, label: str) -> None:
    if value != expected:
        fail(f"{label} drifted: expected {expected!r}, found {value!r}")


def assert_file_set(root: Path, expected: set[str], label: str) -> None:
    actual = {str(path.relative_to(root)) for path in root.rglob("*") if path.is_file()}
    missing = expected - actual
    if missing:
        fail(f"{label} lost required files: {sorted(missing)}")


def verify_artifact_metadata() -> dict:
    ledger = {}
    meta_root = ART / "metadata"
    for key, expected in ARTIFACTS.items():
        path = meta_root / f"{key}.json"
        data = load(path)
        exact(data.get("id"), expected["id"], f"{key} artifact id")
        exact(data.get("name"), expected["name"], f"{key} artifact name")
        exact(data.get("expired"), False, f"{key} artifact expiry")
        exact(data.get("digest"), f"sha256:{expected['sha256']}", f"{key} artifact digest")
        exact((data.get("workflow_run") or {}).get("id"), expected["run"], f"{key} artifact run")
        zip_path = ART / "zips" / f"{key}.zip"
        exact(sha(zip_path), expected["sha256"], f"{key} downloaded ZIP")
        ledger[key] = {
            **expected,
            "bytes": zip_path.stat().st_size,
            "created_at": data.get("created_at"),
        }
    return ledger


def verify_repository() -> dict:
    exact(git("rev-parse", "HEAD"), PRODUCT_COMMIT, "repository HEAD")
    exact(git("rev-parse", "HEAD^{tree}"), PRODUCT_TREE, "product tree")
    exact(git("show", "-s", "--format=%P", "HEAD"), CANONICAL_PARENT, "product parent")
    exact(git("show", "-s", "--format=%s", "HEAD"), "Star Trek: publish Kukulkan cycle", "product message")

    cycle_path = REPO / "data/review/adapter-sdk/star-trek-kukulkan-cycle.json"
    checker_path = REPO / "scripts/star-trek-kukulkan-cycle.mjs"
    exact(sha(cycle_path), CYCLE_FILE_SHA, "canonical cycle file SHA-256")
    exact(sha(checker_path), CHECKER_SHA, "canonical cycle checker SHA-256")
    cycle = load(cycle_path)
    body = dict(cycle)
    receipt_identity = body.pop("receipt_sha256")
    exact(receipt_identity, CYCLE_RECEIPT_IDENTITY, "canonical cycle receipt identity")
    exact(pretty_identity(body), CYCLE_RECEIPT_IDENTITY, "recomputed canonical cycle receipt identity")
    exact(cycle.get("canonical_parent"), CANONICAL_PARENT, "cycle canonical parent")
    exact(cycle["task"]["id"], TASK_ID, "cycle task id")
    exact(cycle["task"]["source_fingerprint"], TASK_FINGERPRINT, "cycle source fingerprint")
    exact(cycle["task"]["role"], "Kukulkan", "cycle role")
    exact(cycle["task"]["performer"], "James Doohan", "cycle performer")
    exact(cycle["task"]["performance_mode"], "voice-only", "cycle performance mode")
    exact(cycle["task"]["maker_attribution"], "unresolved", "cycle maker boundary")
    exact(cycle["canonical"]["wall_id"], WALL_ID, "cycle wall id")
    exact(cycle["canonical"]["record"]["still"]["src"], "images/uc-1390-still.webp", "canonical still path")
    exact(cycle["canonical"]["record"]["portrait"]["src"], "images/uc-1390-portrait.jpg", "canonical portrait path")
    exact(cycle["media"]["still_sha256"], STILL_SHA, "canonical still hash")
    exact(cycle["media"]["portrait_sha256"], PORTRAIT_SHA, "canonical portrait hash")
    exact(cycle["media"]["facets_sha256"], CANONICAL_FACETS_SHA, "canonical media facets identity")
    exact(cycle["media"]["maker_attribution"], "unresolved", "canonical media maker boundary")
    exact(cycle["queue"]["before"], {"total": 2228, "queued": 1806, "resolved": 421, "blocked": 0, "rejected": 1, "in_flight": 0}, "queue before")
    exact(cycle["queue"]["after"], {"total": 2228, "queued": 1805, "resolved": 422, "blocked": 0, "rejected": 1, "in_flight": 0}, "queue after")
    exact(cycle["reviewed_cycle"]["id"], "cycle_0175bc5e1dd368374c066342", "reviewed cycle id")
    exact(cycle["reviewed_cycle"]["prior_cycle_id"], "cycle_a2b0baa44a5fbbdc9c2ddb6b", "prior cycle id")
    exact(cycle["qualification"]["checker_sha256"], CHECKER_SHA, "qualification checker hash")
    execution = cycle["execution"]
    exact(execution["publication_run"], PUBLICATION_RUN, "cycle publication run")
    exact(execution["publication_job"], PUBLICATION_JOB, "cycle publication job")
    exact(execution["candidate_artifact"], ARTIFACTS["candidate"]["id"], "cycle candidate artifact")
    exact(execution["candidate_artifact_sha256"], ARTIFACTS["candidate"]["sha256"], "cycle candidate digest")
    exact(execution["candidate_commit"], CANDIDATE_COMMIT, "cycle candidate commit")
    exact(execution["candidate_tree"], CANDIDATE_TREE, "cycle candidate tree")
    exact(execution["candidate_path_count"], 43, "cycle candidate path count")
    exact(execution["candidate_path_ledger_sha256"], CANDIDATE_PATH_SHA, "cycle candidate path ledger")
    exact(execution["stage_receipt_sha256"], STAGE_RECEIPT_SHA, "cycle stage receipt")
    exact(execution["independent_review_artifact"], ARTIFACTS["independent_review"]["id"], "cycle review artifact")
    exact(execution["independent_review_artifact_sha256"], ARTIFACTS["independent_review"]["sha256"], "cycle review digest")
    exact(execution["independent_review_file_sha256"], REVIEW_FILE_SHA, "cycle review file hash")
    exact(execution["independent_review_identity"], REVIEW_IDENTITY, "cycle review identity")
    exact(execution["media_preparation_artifact"], ARTIFACTS["media_preparation"]["id"], "cycle media artifact")
    exact(execution["media_preparation_artifact_sha256"], ARTIFACTS["media_preparation"]["sha256"], "cycle media digest")
    exact(sha(REPO / "images/uc-1390-still.webp"), STILL_SHA, "live canonical still")
    exact(sha(REPO / "images/uc-1390-portrait.jpg"), PORTRAIT_SHA, "live canonical portrait")
    return cycle


def verify_probe_and_media() -> dict:
    probe_root = ART / "probe_receipt"
    media_root = ART / "media_preparation"
    sealed_root = ART / "sealed_controller"

    probe = load(one(probe_root, "kukulkan-probe-v2.json"))
    exact(probe.get("status"), "success", "probe status")
    exact(probe.get("canonical_parent"), CANONICAL_PARENT, "probe parent")
    exact(probe.get("task_id"), TASK_ID, "probe task")
    exact(probe.get("source_fingerprint"), TASK_FINGERPRINT, "probe fingerprint")
    exact(probe.get("source_receipt_sha256"), SOURCE_RECEIPT_IDENTITY, "probe source identity")
    exact(probe.get("facets_sha256"), PREPARATION_FACETS_SHA, "probe preparation facets")
    exact(probe.get("controller_manifest_sha256"), SEALED_CONTROLLER_MANIFEST_SHA, "probe controller manifest")
    exact(probe.get("canonical_mutation"), False, "probe canonical mutation")
    exact(probe.get("lease_taken"), False, "probe lease")

    media = load(one(media_root, "media-preparation.json"))
    source = load(one(media_root, "source-receipt.json"))
    exact(media.get("canonical_parent"), CANONICAL_PARENT, "media parent")
    exact(media.get("task_id"), TASK_ID, "media task")
    exact(media.get("wall_id"), WALL_ID, "media wall id")
    exact(media.get("source_receipt_sha256"), SOURCE_RECEIPT_IDENTITY, "media source identity")
    exact(media.get("facets_sha256"), PREPARATION_FACETS_SHA, "media preparation facets")
    exact(media.get("maker_attribution"), "unresolved", "media maker boundary")
    exact(media.get("byte_collision"), False, "media byte collision")
    exact(media.get("source_collision"), False, "media source collision")
    exact(media.get("cross_facet_substitution"), False, "media cross-facet substitution")
    exact(media["media_review"]["verdict"], "pass", "media review verdict")
    exact(media["still"]["sha256"], STILL_SHA, "prepared still hash")
    exact(media["portrait"]["sha256"], PORTRAIT_SHA, "prepared portrait hash")
    exact(source.get("receipt_sha256"), SOURCE_RECEIPT_IDENTITY, "source receipt identity")
    exact(source.get("performance_mode"), "voice-only", "source performance mode")
    exact(source.get("maker_attribution"), "unresolved", "source maker boundary")
    episodes = load(one(media_root, "episode-receipts.json"))
    exact(len(episodes), 1, "episode receipt cardinality")
    exact(episodes[0]["title"], "How Sharper Than a Serpent's Tooth (episode)", "exact episode title")
    exact(episodes[0]["source"], "https://memory-alpha.fandom.com/wiki/How_Sharper_Than_a_Serpent%27s_Tooth_(episode)", "exact encoded episode source")

    manifest_path = one(sealed_root, "controller-source-manifest.json")
    exact(sha(manifest_path), SEALED_CONTROLLER_MANIFEST_SHA, "sealed controller manifest hash")
    manifest = load(manifest_path)
    exact(manifest.get("canonical_parent"), CANONICAL_PARENT, "sealed controller parent")
    exact(manifest.get("task_id"), TASK_ID, "sealed controller task")
    exact(manifest.get("source_receipt_identity"), SOURCE_RECEIPT_IDENTITY, "sealed controller source identity")
    for row in manifest.get("files", []):
        path = manifest_path.parent / "programs" / row["file"]
        exact(path.stat().st_size, row["bytes"], f"sealed controller bytes {path.name}")
        exact(sha(path), row["sha256"], f"sealed controller hash {path.name}")
    return {"probe": probe, "media": media, "source": source, "sealed_controller": manifest}


def verify_execution_controller() -> dict:
    root = ART / "execution_controller"
    manifest_path = one(root, "controller-source-manifest.json")
    manifest = load(manifest_path)
    exact(manifest.get("canonical_parent"), CANONICAL_PARENT, "execution controller parent")
    exact(manifest.get("task_id"), TASK_ID, "execution controller task")
    exact(manifest.get("source_receipt_identity"), SOURCE_RECEIPT_IDENTITY, "execution controller source identity")
    rebinding = manifest.get("execution_rebinding") or {}
    exact(rebinding.get("status"), "applied", "execution controller rebinding status")
    exact(rebinding.get("receipt_sha256"), EXECUTION_REBINDING_IDENTITY, "execution controller rebinding identity")
    receipt = load(one(root, "execution-controller-rebinding.json"))
    exact(receipt.get("status"), "applied", "execution rebinding receipt status")
    exact(receipt.get("receipt_sha256"), EXECUTION_REBINDING_IDENTITY, "execution rebinding receipt identity")
    exact(receipt.get("sealed_source_receipt_sha256"), SOURCE_RECEIPT_IDENTITY, "execution rebinding source identity")
    exact(receipt.get("sealed_facets_sha256"), PREPARATION_FACETS_SHA, "execution rebinding facets identity")
    for row in manifest.get("files", []):
        path = manifest_path.parent / "programs" / row["file"]
        exact(path.stat().st_size, row["bytes"], f"execution controller bytes {path.name}")
        exact(sha(path), row["sha256"], f"execution controller hash {path.name}")
    return {"manifest": manifest, "rebinding": receipt, "manifest_sha256": sha(manifest_path)}


def verify_candidate_review_and_final(cycle: dict) -> dict:
    candidate_root = ART / "candidate"
    review_root = ART / "independent_review"
    final_root = ART / "final_product_receipt"

    candidate_meta = load(one(candidate_root, "candidate-metadata.json"))
    candidate_paths_file = one(candidate_root, "candidate-paths.txt")
    candidate_paths = [line for line in candidate_paths_file.read_text().splitlines() if line]
    exact(candidate_meta.get("canonical_parent"), CANONICAL_PARENT, "candidate parent")
    exact(candidate_meta.get("candidate_commit"), CANDIDATE_COMMIT, "candidate commit")
    exact(candidate_meta.get("candidate_tree"), CANDIDATE_TREE, "candidate tree")
    exact(candidate_meta.get("candidate_path_count"), 43, "candidate path count")
    exact(candidate_meta.get("candidate_path_ledger_sha256"), CANDIDATE_PATH_SHA, "candidate path ledger field")
    exact(len(candidate_paths), 43, "candidate path ledger cardinality")
    exact(sha(candidate_paths_file), CANDIDATE_PATH_SHA, "candidate path ledger file")
    exact(sha(one(candidate_root, "stage.json")), "f2f30ce973f0056e94a3fb3550f696ed2e0f1a2aa088885f89241afe0226f91d", "candidate stage file")

    review_path = one(review_root, "independent-review.json")
    review = load(review_path)
    exact(sha(review_path), REVIEW_FILE_SHA, "independent review file")
    exact(review.get("verdict"), "pass", "independent review verdict")
    exact(review.get("review_sha256"), REVIEW_IDENTITY, "independent review identity")
    exact(review.get("canonical_parent"), CANONICAL_PARENT, "independent review parent")
    exact(review["candidate"]["commit"], CANDIDATE_COMMIT, "reviewed candidate commit")
    exact(review["candidate"]["tree"], CANDIDATE_TREE, "reviewed candidate tree")
    exact(review["candidate"]["path_count"], 43, "reviewed candidate path count")
    exact(review["candidate"]["path_ledger_sha256"], CANDIDATE_PATH_SHA, "reviewed candidate path ledger")
    exact(review["candidate"]["stage_receipt_sha256"], STAGE_RECEIPT_SHA, "reviewed stage receipt")
    exact(review["exact_subject"]["task_id"], TASK_ID, "review subject task")
    exact(review["exact_subject"]["source_fingerprint"], TASK_FINGERPRINT, "review subject fingerprint")
    exact(review["exact_subject"]["still_sha256"], STILL_SHA, "review still hash")
    exact(review["exact_subject"]["portrait_sha256"], PORTRAIT_SHA, "review portrait hash")

    exact(one(final_root, "product-commit.txt").read_text().strip(), PRODUCT_COMMIT, "final receipt product commit")
    exact(one(final_root, "product-tree.txt").read_text().strip(), PRODUCT_TREE, "final receipt product tree")
    exact(int(one(final_root, "pages-run.txt").read_text().strip()), PAGES_RUN, "final receipt Pages run")
    publication = one(final_root, "publication.txt").read_text()
    for needle in (PRODUCT_COMMIT, PRODUCT_TREE, f"pages_run={PAGES_RUN}", "UC-1390 James Doohan as Kukulkan"):
        if needle not in publication:
            fail(f"final publication receipt lost binding: {needle}")
    exact(one(final_root, "candidate-metadata.json").read_bytes(), one(candidate_root, "candidate-metadata.json").read_bytes(), "final/candidate metadata identity")
    exact(one(final_root, "independent-review.json").read_bytes(), review_path.read_bytes(), "final/review identity")
    exact(one(final_root, "stage.json").read_bytes(), one(candidate_root, "stage.json").read_bytes(), "final/stage identity")
    exact(one(final_root, "star-trek-kukulkan-cycle.json").read_bytes(), (REPO / "data/review/adapter-sdk/star-trek-kukulkan-cycle.json").read_bytes(), "final/live cycle receipt identity")
    exact(one(final_root, "star-trek-kukulkan-cycle.mjs").read_bytes(), (REPO / "scripts/star-trek-kukulkan-cycle.mjs").read_bytes(), "final/live checker identity")

    product_paths_file = one(final_root, "product-paths.txt")
    product_paths = [line for line in product_paths_file.read_text().splitlines() if line]
    exact(len(product_paths), 50, "product path ledger cardinality")
    exact(sha(product_paths_file), PRODUCT_PATH_SHA, "product path ledger file")
    candidate_set = set(candidate_paths)
    product_set = set(product_paths)
    exact(candidate_set - product_set, set(), "candidate-only path set")
    exact(product_set - candidate_set, FINALIZATION_PATHS, "exact finalization path set")
    for path in product_paths:
        if not (REPO / path).exists():
            fail(f"product path missing from exact product tree: {path}")

    finalize = load(one(final_root, "unitkukulkan-finalize.json"))
    exact(finalize.get("candidate_commit"), CANDIDATE_COMMIT, "finalize candidate commit")
    exact(finalize.get("candidate_tree"), CANDIDATE_TREE, "finalize candidate tree")
    exact(finalize.get("review_identity"), REVIEW_IDENTITY, "finalize review identity")
    exact(finalize.get("cycle_id"), cycle["reviewed_cycle"]["id"], "finalize cycle id")
    exact(finalize.get("receipt_identity"), CYCLE_RECEIPT_IDENTITY, "finalize cycle receipt identity")
    exact(finalize.get("checker_sha256"), CHECKER_SHA, "finalize checker hash")
    exact(finalize.get("queue"), cycle["queue"]["after"], "finalize queue")

    unit_execution = load(one(final_root, "unitkukulkan-execution.json"))
    exact(unit_execution.get("workflow_run"), PUBLICATION_RUN, "final execution workflow run")
    exact(unit_execution.get("candidate_artifact"), ARTIFACTS["candidate"]["id"], "final execution candidate artifact")
    exact(unit_execution.get("candidate_artifact_sha256"), ARTIFACTS["candidate"]["sha256"], "final execution candidate digest")
    exact(unit_execution.get("independent_review_artifact"), ARTIFACTS["independent_review"]["id"], "final execution review artifact")
    exact(unit_execution.get("independent_review_artifact_sha256"), ARTIFACTS["independent_review"]["sha256"], "final execution review digest")
    exact(unit_execution.get("media_preparation_artifact"), ARTIFACTS["media_preparation"]["id"], "final execution media artifact")
    exact(unit_execution.get("media_preparation_artifact_sha256"), ARTIFACTS["media_preparation"]["sha256"], "final execution media digest")

    key_sha = one(final_root, "key-sha256.txt").read_text()
    for needle in (CYCLE_FILE_SHA, CHECKER_SHA, STILL_SHA, PORTRAIT_SHA):
        if needle not in key_sha:
            fail(f"final key hash ledger lost binding: {needle}")

    return {
        "candidate_metadata": candidate_meta,
        "review": review,
        "candidate_paths": candidate_paths,
        "product_paths": product_paths,
        "finalization_paths": sorted(FINALIZATION_PATHS),
        "finalize": finalize,
        "unit_execution": unit_execution,
    }


def verify_run_and_pages() -> dict:
    publication_run = load(ART / "metadata/publication-run.json")
    publication_jobs = load(ART / "metadata/publication-jobs.json")
    exact(publication_run.get("id"), PUBLICATION_RUN, "publication run id")
    exact(publication_run.get("status"), "completed", "publication run status")
    exact(publication_run.get("conclusion"), "failure", "publication run conclusion")
    exact(publication_run.get("head_sha"), "3a5124cf9a73180f61058179531fa7150814c666", "publication workflow head")
    jobs = publication_jobs.get("jobs") or []
    exact(len(jobs), 1, "publication job cardinality")
    job = jobs[0]
    exact(job.get("id"), PUBLICATION_JOB, "publication job id")
    exact(job.get("conclusion"), "failure", "publication job conclusion")
    conclusions = {step["name"]: step.get("conclusion") for step in job.get("steps", [])}
    required_success = {
        "Bind successful probe and install exact execution controller",
        "Upload exact execution controller and preflight",
        "Stage exact Kukulkan candidate",
        "Upload exact Kukulkan candidate",
        "Review exact Kukulkan candidate independently",
        "Upload exact independent Kukulkan review",
        "Publish exact reviewed Kukulkan product",
        "Upload exact Kukulkan final product receipt",
    }
    for name in required_success:
        exact(conclusions.get(name), "success", f"publication step {name}")
    exact(conclusions.get("Seal exact Kukulkan execution"), "failure", "historical false seal gate")
    failures = [name for name, conclusion in conclusions.items() if conclusion == "failure"]
    exact(failures, ["Seal exact Kukulkan execution"], "publication failure set")

    pages_run = load(ART / "metadata/pages-run.json")
    pages_jobs = load(ART / "metadata/pages-jobs.json")
    exact(pages_run.get("id"), PAGES_RUN, "Pages run id")
    exact(pages_run.get("status"), "completed", "Pages run status")
    exact(pages_run.get("conclusion"), "success", "Pages run conclusion")
    exact(pages_run.get("head_sha"), PRODUCT_COMMIT, "Pages product commit")
    deploy_jobs = [row for row in (pages_jobs.get("jobs") or []) if row.get("name") == "deploy"]
    exact(len(deploy_jobs), 1, "Pages deploy job cardinality")
    exact(deploy_jobs[0].get("conclusion"), "success", "Pages deploy job conclusion")
    pages_log = (ART / "metadata/pages.log").read_text(errors="replace")
    if PRODUCT_COMMIT not in pages_log:
        fail("Pages log lost exact product commit")
    if "https://bigbirdreturns.github.io/undercast/" not in pages_log:
        fail("Pages log lost deployment URL")
    return {
        "publication_run": PUBLICATION_RUN,
        "publication_job": PUBLICATION_JOB,
        "historical_failed_gate": "candidate tree was incorrectly required to equal finalized product tree",
        "pages_run": PAGES_RUN,
        "pages_deploy_job": deploy_jobs[0].get("id"),
    }


def verify_next_obligation() -> dict:
    next_path = ART / "metadata/thesis-next-live.json"
    data = load(next_path)
    exact(data.get("phase"), "ready-for-one-cycle", "next rail phase")
    candidate = data.get("candidate") or {}
    exact(candidate.get("task_id"), "ap_a65494e8328ca262d82a49c0", "next task id")
    exact(candidate.get("performer"), "Majel Barrett", "next performer")
    exact(candidate.get("character"), "Lwaxana Troi", "next character")
    exact(candidate.get("source_fingerprint"), "f5b48cb2179b2192e0c02eedfb417a891278757693c31fd9dea19cb5351e132f", "next fingerprint")
    exact(candidate.get("performance_modes"), ["physical-prosthetic"], "next modality")
    return data


def write_execution(
    artifact_ledger: dict,
    cycle: dict,
    probe: dict,
    controller: dict,
    product: dict,
    run_pages: dict,
    next_obligation: dict,
) -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    execution = {
        "version": 1,
        "transaction": "STAR-TREK-KUKULKAN-TERMINAL-EXECUTION-V1",
        "status": "success",
        "generated_at": generated_at,
        "canonical_product": {
            "commit": PRODUCT_COMMIT,
            "tree": PRODUCT_TREE,
            "parent": CANONICAL_PARENT,
            "message": "Star Trek: publish Kukulkan cycle",
            "task_id": TASK_ID,
            "source_fingerprint": TASK_FINGERPRINT,
            "wall_id": WALL_ID,
            "cycle_id": cycle["reviewed_cycle"]["id"],
            "cycle_receipt_identity": CYCLE_RECEIPT_IDENTITY,
            "cycle_file_sha256": CYCLE_FILE_SHA,
            "checker_sha256": CHECKER_SHA,
        },
        "candidate": {
            "commit": CANDIDATE_COMMIT,
            "tree": CANDIDATE_TREE,
            "path_count": 43,
            "path_ledger_sha256": CANDIDATE_PATH_SHA,
            "independent_review_identity": REVIEW_IDENTITY,
        },
        "candidate_to_product_delta": {
            "candidate_is_sibling_from_canonical_parent": True,
            "candidate_only_paths": [],
            "product_only_paths": product["finalization_paths"],
            "candidate_path_count": 43,
            "product_path_count": 50,
            "product_path_ledger_sha256": PRODUCT_PATH_SHA,
            "false_gate_retired": "candidate tree equality",
            "replacement_gate": "candidate path set plus exact seven finalization paths equals product path set",
        },
        "source_and_media": {
            "source_receipt_identity": SOURCE_RECEIPT_IDENTITY,
            "preparation_facets_sha256": PREPARATION_FACETS_SHA,
            "canonical_facets_sha256": CANONICAL_FACETS_SHA,
            "still_sha256": STILL_SHA,
            "portrait_sha256": PORTRAIT_SHA,
            "maker_attribution": "unresolved",
            "performance_mode": "voice-only",
        },
        "controller": {
            "sealed_manifest_sha256": SEALED_CONTROLLER_MANIFEST_SHA,
            "execution_manifest_sha256": controller["manifest_sha256"],
            "execution_rebinding_identity": EXECUTION_REBINDING_IDENTITY,
        },
        "runs": run_pages,
        "artifacts": artifact_ledger,
        "queue_after": cycle["queue"]["after"],
        "next_deterministic_obligation": next_obligation,
        "canonical_mutation_performed_by_terminalizer": False,
        "additional_lease_taken": False,
    }
    execution["receipt_sha256"] = pretty_identity(execution)
    (OUT / "execution.json").write_text(json.dumps(execution, indent=2, ensure_ascii=False) + "\n")
    (OUT / "artifact-ledger.json").write_text(json.dumps(artifact_ledger, indent=2, ensure_ascii=False) + "\n")
    (OUT / "candidate-to-product-delta.json").write_text(
        json.dumps(execution["candidate_to_product_delta"], indent=2, ensure_ascii=False) + "\n"
    )
    shutil.copy2(REPO / "data/review/adapter-sdk/star-trek-kukulkan-cycle.json", OUT / "star-trek-kukulkan-cycle.json")
    shutil.copy2(REPO / "scripts/star-trek-kukulkan-cycle.mjs", OUT / "star-trek-kukulkan-cycle.mjs")
    shutil.copy2(ART / "metadata/thesis-next-live.json", OUT / "next-deterministic-obligation.json")
    shutil.copy2(one(ART / "final_product_receipt", "publication.txt"), OUT / "publication.txt")
    shutil.copy2(one(ART / "final_product_receipt", "product-paths.txt"), OUT / "product-paths.txt")
    shutil.copy2(one(ART / "candidate", "candidate-paths.txt"), OUT / "candidate-paths.txt")
    shutil.copy2(one(ART / "independent_review", "independent-review.json"), OUT / "independent-review.json")
    shutil.copy2(one(ART / "execution_controller", "controller-source-manifest.json"), OUT / "execution-controller-source-manifest.json")
    shutil.copy2(one(ART / "execution_controller", "execution-controller-rebinding.json"), OUT / "execution-controller-rebinding.json")
    manifest_lines = []
    for path in sorted(OUT.iterdir()):
        if path.name == "manifest.sha256":
            continue
        manifest_lines.append(f"{sha(path)}  {path.name}")
    (OUT / "manifest.sha256").write_text("\n".join(manifest_lines) + "\n")


def main() -> None:
    artifact_ledger = verify_artifact_metadata()
    cycle = verify_repository()
    probe = verify_probe_and_media()
    controller = verify_execution_controller()
    product = verify_candidate_review_and_final(cycle)
    run_pages = verify_run_and_pages()
    next_obligation = verify_next_obligation()
    write_execution(artifact_ledger, cycle, probe, controller, product, run_pages, next_obligation)
    print(json.dumps({
        "status": "success",
        "product_commit": PRODUCT_COMMIT,
        "product_tree": PRODUCT_TREE,
        "cycle_receipt_identity": CYCLE_RECEIPT_IDENTITY,
        "candidate_path_count": 43,
        "product_path_count": 50,
        "next_character": "Lwaxana Troi",
        "canonical_mutation": False,
    }, indent=2))


if __name__ == "__main__":
    main()
