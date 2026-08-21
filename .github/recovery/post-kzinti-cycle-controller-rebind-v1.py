from __future__ import annotations

from pathlib import Path
import hashlib
import json
import re
import shutil
import sys

if len(sys.argv) != 5:
    raise SystemExit("usage: post-kzinti-cycle-controller-rebind-v1.py <source-programs> <output-root> <preparation-root> <repo-root>")

source_programs = Path(sys.argv[1]).resolve()
output_root = Path(sys.argv[2]).resolve()
preparation = Path(sys.argv[3]).resolve()
repo = Path(sys.argv[4]).resolve()
programs = output_root / "programs"


def fail(message: str) -> None:
    raise SystemExit(message)


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> str:
    return sha_bytes(path.read_bytes())


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def pretty(value) -> str:
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def replace_number(text: str, old: int, token: str) -> str:
    return re.sub(rf"(?<!\d){old}(?!\d)", token, text)


def replace_const(text: str, name: str, value) -> tuple[str, int]:
    literal = json.dumps(value, ensure_ascii=False)
    pattern = re.compile(rf"^(const\s+{re.escape(name)}\s*=\s*).*?;\s*$", re.M)
    return pattern.subn(lambda match: match.group(1) + literal + ";", text)


media = json.loads((preparation / "media-preparation.json").read_text())
probe = json.loads((preparation / "source-probe.json").read_text())
task = json.loads((preparation / "task.json").read_text())
parent = media["canonical_parent"]
task_id = media["task_id"]
fingerprint = media["source_fingerprint"]
wall = media["wall_id"]
character = media["character"]
performer = media["performer"]
slug = slugify(character)
unit = "unit" + slug
source = task["source"]
production = task.get("production") or "Star Trek"
years = str(task.get("years") or "")
episode = production
match = re.search(r"\(([^()]*)\)\s*$", production)
if match:
    episode = match.group(1)

if probe.get("canonical_parent") != parent or probe.get("task_id") != task_id:
    fail("successor source probe binding drifted")
if media.get("performance_mode") != "voice-only" or media.get("maker_attribution") != "unresolved":
    fail("successor media adjudication drifted")
if media.get("media_review", {}).get("verdict") != "pass" or media.get("canonical_mutation") is not False or media.get("lease_taken") is not False:
    fail("successor media authority drifted")

# Identify the live Kzinti Flyer product receipt and checker.
kzinti_receipts = []
for path in (repo / "data/review/adapter-sdk").glob("star-trek-kzinti-flyer*.json"):
    try:
        value = json.loads(path.read_text())
    except Exception:
        continue
    if "ap_8f2b1b123aa02bbbb27d00b4" in json.dumps(value) and value.get("canonical"):
        kzinti_receipts.append((path, value))
if not kzinti_receipts:
    fail("Kzinti Flyer canonical receipt missing")
kzinti_receipts.sort(key=lambda row: row[0].name)
old_receipt_path, old_receipt = kzinti_receipts[-1]
old_task = old_receipt["task"]["id"]
old_fingerprint = old_receipt["task"]["source_fingerprint"]
old_parent = old_receipt["canonical_parent"]
old_wall = old_receipt["canonical"]["wall_id"]
old_record = old_receipt["canonical"]["record"]
old_source = old_receipt["task"]["source"]
old_role = old_receipt["task"].get("role") or old_record["character"]
old_slug = slugify(old_role)
old_unit = "unit" + old_slug
old_still_origin = old_record["still"]["origin"]
old_portrait_origin = old_record["portrait"]["origin"]
old_episode_sources = [row["source"] for row in old_record.get("references", []) if row.get("claim") == "production"]
old_episode_source = old_episode_sources[0] if old_episode_sources else old_source
old_production = old_record["production"]
old_years = old_record["years"]

old_checkers = []
for path in (repo / "scripts").glob("star-trek-kzinti-flyer*.mjs"):
    text = path.read_text(errors="replace")
    if old_task in text and old_wall in text:
        old_checkers.append(path)
if not old_checkers:
    fail("Kzinti Flyer checker missing")
old_checkers.sort(key=lambda path: path.name)
prior_checker_path = old_checkers[-1]
prior_receipt_rel = str(old_receipt_path.relative_to(repo))
prior_checker_rel = str(prior_checker_path.relative_to(repo))
prior_receipt_file_sha = sha_file(old_receipt_path)
prior_receipt_identity = old_receipt.get("receipt_sha256") or prior_receipt_file_sha
prior_checker_sha = sha_file(prior_checker_path)
prior_cycle_id = (old_receipt.get("reviewed_cycle") or {}).get("id")
if not prior_cycle_id:
    fail("Kzinti Flyer cycle identity missing")

still = media["still"]
portrait = media["portrait"]
still_origin = still["origin"]
still_page = still["source_page"]
portrait_origin = portrait["origin"]
portrait_author = portrait.get("author") or ""
portrait_license = portrait.get("license") or ""
portrait_year = 2005
for value in (portrait.get("title", ""), portrait.get("description", ""), portrait.get("timestamp", "")):
    found = re.search(r"\b(19\d{2}|20[0-2]\d)\b", str(value))
    if found:
        portrait_year = int(found.group(1))
        break
fetched_at = str(media.get("generated_at") or probe.get("generated_at"))[:10]

# Derive live metrics and one-card deltas. The source controller describes the
# Kzinti transition: source-before -> current. The successor transition shifts
# current -> desired-after by the same bounded card/media/task deltas.
autopilot = json.loads((repo / "data/AUTOPILOT.json").read_text())
trek = [row for row in autopilot["jobs"] if row.get("scope") == "star-trek"]
queued = sum(row.get("status") == "queued" for row in trek)
resolved = sum(row.get("status") == "resolved" for row in trek)
rejected = sum(row.get("status") == "rejected" for row in trek)
specimens = json.loads((repo / "data/specimens.json").read_text())
sources = json.loads((repo / "data/SOURCES.json").read_text())
media_audit = json.loads((repo / "data/MEDIA-AUDIT.json").read_text())
trek_facets = [row for row in media_audit["items"] if row.get("scope") == "star-trek"]
verified = sum(row.get("status") == "verified" for row in trek_facets)
honest_absences = len(trek_facets) - verified
portrait_count = sum(bool(row.get("portrait")) for row in specimens)
still_count = sum(bool(row.get("still")) for row in specimens)
source_count = len(sources)

metrics = [
    # source_before, current, desired_after
    (queued + 1, queued, queued - 1),
    (resolved - 1, resolved, resolved + 1),
    (len(specimens) - 1, len(specimens), len(specimens) + 1),
    (len(trek_facets) - 2, len(trek_facets), len(trek_facets) + 2),
    (verified - 2, verified, verified + 2),
    (portrait_count - 1, portrait_count, portrait_count + 1),
    (still_count - 1, still_count, still_count + 1),
    (source_count - 1, source_count, source_count + 1),
]
# Global queue/resolution counts can also appear in controller assertions.
all_queued = sum(row.get("status") == "queued" for row in autopilot["jobs"])
all_resolved = sum(row.get("status") == "resolved" for row in autopilot["jobs"])
metrics.extend([(all_queued + 1, all_queued, all_queued - 1), (all_resolved - 1, all_resolved, all_resolved + 1)])

# Preserve only non-conflicting, non-small global mappings. Small values are
# patched by semantic context below.
number_map: dict[int, int] = {}
conflicts: set[int] = set()
for before, current, after in metrics:
    for old, new in ((before, current), (current, after)):
        if old < 20:
            continue
        if old in number_map and number_map[old] != new:
            conflicts.add(old)
        else:
            number_map[old] = new
for value in conflicts:
    number_map.pop(value, None)

old_names = {
    f"{old_unit}-controller.sh": f"{unit}-controller.sh",
    f"{old_unit}-stage.mjs": f"{unit}-stage.mjs",
    f"{old_unit}-review.mjs": f"{unit}-review.mjs",
    f"{old_unit}-prior-phase.mjs": f"{unit}-prior-phase.mjs",
    f"{old_unit}-finalize.mjs": f"{unit}-finalize.mjs",
}
if output_root.exists():
    shutil.rmtree(output_root)
programs.mkdir(parents=True)

for old_name, new_name in old_names.items():
    src = source_programs / old_name
    if not src.is_file():
        fail(f"Kzinti controller program missing: {old_name}")
    text = src.read_text()

    # Preserve the old role name where it denotes immutable predecessor custody.
    text = text.replace(old_role, "__PRIOR_TARGET_ROLE__")
    text = text.replace(old_slug, "__prior_target_slug__")
    text = text.replace(old_slug.upper().replace("-", "_"), "__PRIOR_TARGET_UP__")

    replacements = [
        (old_parent, parent),
        (old_task, task_id),
        (old_fingerprint, fingerprint),
        (old_wall, wall),
        (old_source, source),
        (old_episode_source, source),
        (old_still_origin, still_origin),
        (old_portrait_origin, portrait_origin),
        (old_production, production),
        (old_years, years),
        ("star-trek-kzinti-flyer-media-v1", "star-trek-post-kzinti-media-v1"),
        (old_unit, unit),
    ]
    for old, new in replacements:
        text = text.replace(str(old), str(new))

    text = text.replace("__PRIOR_TARGET_ROLE__", character)
    text = text.replace("__prior_target_slug__", slug)
    text = text.replace("__PRIOR_TARGET_UP__", slug.upper().replace("-", "_"))

    for const_name, value in (
        ("MAIN", parent), ("CANONICAL_PARENT", parent), ("EXPECTED_MAIN", parent),
        ("TASK", task_id), ("TASK_ID", task_id), ("FINGERPRINT", fingerprint), ("TASK_FINGERPRINT", fingerprint),
        ("WALL", wall), ("WALL_ID", wall), ("PERFORMER", performer), ("ROLE", character),
        ("SOURCE", source), ("FIRST_EPISODE_SOURCE", source), ("LAST_EPISODE_SOURCE", source),
        ("STILL_SOURCE", still_origin), ("STILL_ORIGIN", still_origin),
        ("PORTRAIT_SOURCE", portrait_origin), ("PORTRAIT_ORIGIN", portrait_origin),
    ):
        text, count = replace_const(text, const_name, value)
        if count > 1:
            fail(f"{old_name}: constant {const_name} cardinality drifted: {count}")

    # Bind immediate Kzinti predecessor constants.
    lines = []
    for line in text.splitlines():
        upper = line.upper()
        if "PRIOR" in upper:
            if "RECEIPT" in upper and "PATH" in upper:
                line = re.sub(r"([\"']).*?([\"'])", lambda m: m.group(1) + prior_receipt_rel + m.group(2), line, count=1)
            elif "CHECKER" in upper and "PATH" in upper:
                line = re.sub(r"([\"']).*?([\"'])", lambda m: m.group(1) + prior_checker_rel + m.group(2), line, count=1)
            elif "RECEIPT" in upper and ("FILE" in upper or "SHA" in upper) and "IDENT" not in upper:
                line = re.sub(r"[0-9a-f]{64}", prior_receipt_file_sha, line, count=1)
            elif "RECEIPT" in upper and ("IDENT" in upper or "_ID" in upper):
                line = re.sub(r"[0-9a-f]{64}", prior_receipt_identity, line, count=1)
            elif "CHECKER" in upper and "SHA" in upper:
                line = re.sub(r"[0-9a-f]{64}", prior_checker_sha, line, count=1)
            elif "CYCLE" in upper:
                line = re.sub(r"cycle_[0-9a-f]{24}", prior_cycle_id, line, count=1)
        lines.append(line)
    text = "\n".join(lines) + "\n"
    text = re.sub(r"data/review/adapter-sdk/star-trek-[a-z0-9-]+-cycle\.json", prior_receipt_rel, text)
    text = re.sub(r"scripts/star-trek-kzinti-flyer[^\"']*\.mjs", prior_checker_rel, text)

    # Apply non-conflicting live-metric shifts.
    placeholders = {}
    for index, (old, new) in enumerate(sorted(number_map.items(), reverse=True)):
        token = f"__POST_KZ_METRIC_{index}__"
        text = replace_number(text, old, token)
        placeholders[token] = str(new)
    for token, value in placeholders.items():
        text = text.replace(token, value)

    # Small task-state values are patched only in semantic lines.
    repaired = []
    for line in text.splitlines():
        lower = line.lower()
        if "rejected" in lower:
            line = re.sub(r"(?<!\d)\d+(?!\d)", lambda m: str(rejected) if int(m.group(0)) == rejected else m.group(0), line)
        repaired.append(line)
    text = "\n".join(repaired) + "\n"

    # Target prose remains evidence-scoped and does not promote maker labor.
    text = text.replace(
        f"The frozen {character} source identifies {performer} as the role’s voice performer.",
        f"The frozen {character} source identifies {performer} as the role’s voice performer."
    )
    text = re.sub(
        rf"The frozen [^\n\"]+ source identifies {re.escape(performer)}[^\n\"]+",
        f"The frozen {character} source identifies {performer} as the role’s voice performer. This supports a voice-only performance claim limited to {character}; physical performance, animation, character design, voice direction, editing, sound processing, production-shop, vocal-transformation, and other maker labor remain unresolved.",
        text,
    )
    text = text.replace("Kzinti Flyer, the animated Kzinti pilot", f"{character}, the animated role")
    text = text.replace("Kzinti pilot", character)
    text = text.replace("Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, Ari bn Bem, and the other animated Doohan roles remain separate identities", f"Kzinti Flyer and the other separately receipted roles remain distinct from {character}")

    if new_name == f"{unit}-stage.mjs":
        text = re.sub(r"year:\s*\d{4},", f"year: {portrait_year},", text)
        text = re.sub(r"fetched_at:\s*['\"]\d{4}-\d{2}-\d{2}['\"]", f"fetched_at: '{fetched_at}'", text)

    dst = programs / new_name
    dst.write_text(text)
    if dst.suffix == ".sh":
        dst.chmod(0o755)

all_text = "\n".join(path.read_text() for path in sorted(programs.iterdir()))
for forbidden in (old_task, old_fingerprint, old_parent, old_wall, old_unit):
    if forbidden in all_text:
        fail(f"successor controller retained forbidden predecessor target binding: {forbidden}")
for required in (task_id, fingerprint, parent, wall, character, performer, source, prior_receipt_rel, prior_checker_rel, "star-trek-post-kzinti-media-v1"):
    if required not in all_text:
        fail(f"successor controller lost required binding: {required}")
for required_file in (f"{unit}-stage.mjs", f"{unit}-review.mjs", f"{unit}-finalize.mjs"):
    text = (programs / required_file).read_text()
    if task_id not in text or fingerprint not in text or wall not in text:
        fail(f"{required_file} lacks exact task binding")

manifest = {
    "version": 1,
    "transaction": "STAR-TREK-POST-KZINTI-CONTROLLER-REBINDING-V1",
    "status": "applied",
    "canonical_parent": parent,
    "task_id": task_id,
    "source_fingerprint": fingerprint,
    "wall_id": wall,
    "character": character,
    "performer": performer,
    "slug": slug,
    "unit_slug": unit,
    "source_probe_sha256": probe["receipt_sha256"],
    "facets_sha256": media["facets_sha256"],
    "metrics": {
        "star_trek": {"queued_before": queued, "queued_after": queued - 1, "resolved_before": resolved, "resolved_after": resolved + 1, "rejected": rejected},
        "wall": {"before": len(specimens), "after": len(specimens) + 1},
        "media": {"facets_before": len(trek_facets), "facets_after": len(trek_facets) + 2, "verified_before": verified, "verified_after": verified + 2, "honest_absences": honest_absences},
    },
    "prior": {
        "receipt_path": prior_receipt_rel,
        "receipt_file_sha256": prior_receipt_file_sha,
        "receipt_identity": prior_receipt_identity,
        "checker_path": prior_checker_rel,
        "checker_sha256": prior_checker_sha,
        "cycle_id": prior_cycle_id,
    },
    "files": [{"file": path.name, "bytes": path.stat().st_size, "sha256": sha_file(path)} for path in sorted(programs.iterdir())],
}
(output_root / "controller-source-manifest.json").write_text(pretty(manifest))
print(json.dumps(manifest, indent=2, ensure_ascii=False))
