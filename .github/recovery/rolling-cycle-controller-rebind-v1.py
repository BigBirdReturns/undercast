from __future__ import annotations

from pathlib import Path
import hashlib
import json
import re
import shutil
import sys

if len(sys.argv) != 6:
    raise SystemExit(
        "usage: rolling-cycle-controller-rebind-v1.py "
        "<source-programs> <source-manifest> <output-root> <preparation-root> <repo-root>"
    )

source_programs = Path(sys.argv[1]).resolve()
source_manifest_path = Path(sys.argv[2]).resolve()
output_root = Path(sys.argv[3]).resolve()
preparation = Path(sys.argv[4]).resolve()
repo = Path(sys.argv[5]).resolve()
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
    return re.sub(rf"(?<![0-9A-Za-z]){old}(?![0-9A-Za-z])", token, text)


def replace_const(text: str, name: str, value) -> tuple[str, int]:
    literal = json.dumps(value, ensure_ascii=False)
    pattern = re.compile(rf"^(const\s+{re.escape(name)}\s*=\s*).*?;\s*$", re.M)
    return pattern.subn(lambda match: match.group(1) + literal + ";", text)


def find_cycle_receipt(task_id: str) -> tuple[Path, dict]:
    rows: list[tuple[Path, dict]] = []
    for path in (repo / "data/review/adapter-sdk").glob("star-trek-*.json"):
        try:
            value = json.loads(path.read_text())
        except Exception:
            continue
        if task_id not in json.dumps(value, ensure_ascii=False):
            continue
        if not value.get("canonical") or not (value.get("reviewed_cycle") or {}).get("id"):
            continue
        rows.append((path, value))
    if len(rows) != 1:
        fail(f"canonical receipt cardinality for {task_id} drifted: {[str(path) for path, _ in rows]}")
    return rows[0]


def find_cycle_checker(task_id: str, wall_id: str) -> Path:
    rows: list[Path] = []
    for path in (repo / "scripts").glob("star-trek-*.mjs"):
        text = path.read_text(errors="replace")
        if task_id in text and wall_id in text:
            rows.append(path)
    if len(rows) != 1:
        fail(f"canonical checker cardinality for {task_id} drifted: {[str(path) for path in rows]}")
    return rows[0]


source_manifest = json.loads(source_manifest_path.read_text())
media = json.loads((preparation / "media-preparation.json").read_text())
probe = json.loads((preparation / "source-probe.json").read_text())
task = json.loads((preparation / "task.json").read_text())

required_source_manifest = (
    "task_id",
    "source_fingerprint",
    "wall_id",
    "character",
    "performer",
    "slug",
    "unit_slug",
)
for key in required_source_manifest:
    if not source_manifest.get(key):
        fail(f"source controller manifest lacks {key}")

old_task_id = source_manifest["task_id"]
old_fingerprint = source_manifest["source_fingerprint"]
old_wall = source_manifest["wall_id"]
old_character = source_manifest["character"]
old_performer = source_manifest["performer"]
old_slug = source_manifest["slug"]
old_unit = source_manifest["unit_slug"]

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

if task_id == old_task_id or wall == old_wall or slug == old_slug:
    fail("rolling successor identity did not advance")
if probe.get("canonical_parent") != parent or probe.get("task_id") != task_id:
    fail("rolling source probe binding drifted")
if probe.get("source_fingerprint") != fingerprint:
    fail("rolling source fingerprint drifted")
if media.get("performance_mode") != "voice-only":
    fail("rolling cycle currently authorizes only source-proven voice-only tasks")
if media.get("maker_attribution") != "unresolved":
    fail("rolling media promoted maker attribution")
if media.get("media_review", {}).get("verdict") != "pass":
    fail("rolling media review is not passing")
if media.get("canonical_mutation") is not False or media.get("lease_taken") is not False:
    fail("rolling preparation exceeded non-mutating authority")

old_receipt_path, old_receipt = find_cycle_receipt(old_task_id)
old_checker_path = find_cycle_checker(old_task_id, old_wall)
old_receipt_rel = str(old_receipt_path.relative_to(repo))
old_checker_rel = str(old_checker_path.relative_to(repo))
old_receipt_file_sha = sha_file(old_receipt_path)
old_receipt_identity = old_receipt.get("receipt_sha256") or old_receipt_file_sha
old_checker_sha = sha_file(old_checker_path)
old_cycle_id = old_receipt["reviewed_cycle"]["id"]
old_record = old_receipt["canonical"]["record"]
old_source = old_receipt["task"]["source"]
old_production = old_record["production"]
old_years = old_record["years"]
old_still_origin = old_record["still"]["origin"]
old_portrait_origin = old_record["portrait"]["origin"]
old_episode_sources = [
    row["source"]
    for row in old_record.get("references", [])
    if row.get("claim") == "production"
]
old_episode_source = old_episode_sources[0] if old_episode_sources else old_source

still = media["still"]
portrait = media["portrait"]
still_origin = still["origin"]
still_page = still["source_page"]
portrait_origin = portrait["origin"]
portrait_author = portrait.get("author") or ""
portrait_license = portrait.get("license") or ""
portrait_year = 2005
for value in (
    portrait.get("title", ""),
    portrait.get("description", ""),
    portrait.get("timestamp", ""),
):
    found = re.search(r"\b(19\d{2}|20[0-2]\d)\b", str(value))
    if found:
        portrait_year = int(found.group(1))
        break
fetched_at = str(media.get("generated_at") or probe.get("generated_at"))[:10]

# Derive every bounded accounting transition from the live predecessor.
autopilot = json.loads((repo / "data/AUTOPILOT.json").read_text())
trek = [row for row in autopilot["jobs"] if row.get("scope") == "star-trek"]
queued = sum(row.get("status") == "queued" for row in trek)
resolved = sum(row.get("status") == "resolved" for row in trek)
rejected = sum(row.get("status") == "rejected" for row in trek)
active = sum(row.get("status") in {"leased", "drafted", "merged"} for row in trek)
if active != 0:
    fail(f"rolling predecessor has active Star Trek work: {active}")
specimens = json.loads((repo / "data/specimens.json").read_text())
sources = json.loads((repo / "data/SOURCES.json").read_text())
media_audit = json.loads((repo / "data/MEDIA-AUDIT.json").read_text())
trek_facets = [row for row in media_audit["items"] if row.get("scope") == "star-trek"]
verified = sum(row.get("status") == "verified" for row in trek_facets)
honest_absences = len(trek_facets) - verified
portrait_count = sum(bool(row.get("portrait")) for row in specimens)
still_count = sum(bool(row.get("still")) for row in specimens)
all_queued = sum(row.get("status") == "queued" for row in autopilot["jobs"])
all_resolved = sum(row.get("status") == "resolved" for row in autopilot["jobs"])

# A source controller represents its own predecessor-to-product delta. Move its
# before/current literals forward to the current/after values for this cycle.
metric_triples = [
    (queued + 1, queued, queued - 1),
    (resolved - 1, resolved, resolved + 1),
    (len(specimens) - 1, len(specimens), len(specimens) + 1),
    (len(sources) - 1, len(sources), len(sources) + 1),
    (len(trek_facets) - 2, len(trek_facets), len(trek_facets) + 2),
    (verified - 2, verified, verified + 2),
    (portrait_count - 1, portrait_count, portrait_count + 1),
    (still_count - 1, still_count, still_count + 1),
    (all_queued + 1, all_queued, all_queued - 1),
    (all_resolved - 1, all_resolved, all_resolved + 1),
]
number_map: dict[int, int] = {}
conflicts: set[int] = set()
for before, current, after in metric_triples:
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
        fail(f"source controller program missing: {old_name}")
    text = src.read_text()

    # Preserve immediate-predecessor names only on explicit prior/predecessor lines.
    preserved_lines: list[str] = []
    for line in text.splitlines():
        lower = line.lower()
        if "prior" in lower or "predecessor" in lower:
            line = line.replace(old_character, "__ROLLING_PRIOR_CHARACTER__")
            line = line.replace(old_slug, "__rolling_prior_slug__")
            line = line.replace(old_unit, "__rolling_prior_unit__")
        preserved_lines.append(line)
    text = "\n".join(preserved_lines) + "\n"

    replacements = [
        (source_manifest.get("canonical_parent", ""), parent),
        (old_task_id, task_id),
        (old_fingerprint, fingerprint),
        (old_wall, wall),
        (old_source, source),
        (old_episode_source, source),
        (old_still_origin, still_origin),
        (old_portrait_origin, portrait_origin),
        (old_production, production),
        (old_years, years),
        (old_performer, performer),
        (old_character, character),
        (old_slug.upper().replace("-", "_"), slug.upper().replace("-", "_")),
        (old_slug, slug),
        (old_unit, unit),
        (f"star-trek-{old_slug}-media-v1", "star-trek-rolling-media-v1"),
    ]
    for old, new in replacements:
        if old:
            text = text.replace(str(old), str(new))

    text = text.replace("__ROLLING_PRIOR_CHARACTER__", old_character)
    text = text.replace("__rolling_prior_slug__", old_slug)
    text = text.replace("__rolling_prior_unit__", old_unit)

    for const_name, value in (
        ("MAIN", parent),
        ("CANONICAL_PARENT", parent),
        ("EXPECTED_MAIN", parent),
        ("TASK", task_id),
        ("TASK_ID", task_id),
        ("FINGERPRINT", fingerprint),
        ("TASK_FINGERPRINT", fingerprint),
        ("WALL", wall),
        ("WALL_ID", wall),
        ("PERFORMER", performer),
        ("ROLE", character),
        ("SOURCE", source),
        ("FIRST_EPISODE_SOURCE", source),
        ("LAST_EPISODE_SOURCE", source),
        ("STILL_SOURCE", still_origin),
        ("STILL_ORIGIN", still_origin),
        ("PORTRAIT_SOURCE", portrait_origin),
        ("PORTRAIT_ORIGIN", portrait_origin),
    ):
        text, count = replace_const(text, const_name, value)
        if count > 1:
            fail(f"{old_name}: constant {const_name} cardinality drifted: {count}")

    # Bind exact immediate predecessor receipt and checker.
    lines: list[str] = []
    for line in text.splitlines():
        upper = line.upper()
        if "PRIOR" in upper or "PREDECESSOR" in upper:
            if "RECEIPT" in upper and "PATH" in upper:
                line = re.sub(
                    r"([\"']).*?([\"'])",
                    lambda match: match.group(1) + old_receipt_rel + match.group(2),
                    line,
                    count=1,
                )
            elif "CHECKER" in upper and "PATH" in upper:
                line = re.sub(
                    r"([\"']).*?([\"'])",
                    lambda match: match.group(1) + old_checker_rel + match.group(2),
                    line,
                    count=1,
                )
            elif "RECEIPT" in upper and ("FILE" in upper or "SHA" in upper) and "IDENT" not in upper:
                line = re.sub(r"[0-9a-f]{64}", old_receipt_file_sha, line, count=1)
            elif "RECEIPT" in upper and ("IDENT" in upper or "_ID" in upper):
                line = re.sub(r"[0-9a-f]{64}", old_receipt_identity, line, count=1)
            elif "CHECKER" in upper and "SHA" in upper:
                line = re.sub(r"[0-9a-f]{64}", old_checker_sha, line, count=1)
            elif "CYCLE" in upper:
                line = re.sub(r"cycle_[0-9a-f]{24}", old_cycle_id, line, count=1)
        lines.append(line)
    text = "\n".join(lines) + "\n"
    text = re.sub(
        r"data/review/adapter-sdk/star-trek-[a-z0-9-]+-cycle\.json",
        old_receipt_rel,
        text,
    )
    text = re.sub(
        r"scripts/star-trek-[a-z0-9-]+-cycle\.mjs",
        old_checker_rel,
        text,
    )

    placeholders: dict[str, str] = {}
    for index, (old, new) in enumerate(sorted(number_map.items(), reverse=True)):
        token = f"__ROLLING_METRIC_{index}__"
        text = replace_number(text, old, token)
        placeholders[token] = str(new)
    for token, value in placeholders.items():
        text = text.replace(token, value)

    # Small counts are bound only in lines naming the corresponding state.
    patched_lines: list[str] = []
    for line in text.splitlines():
        lower = line.lower()
        if "rejected" in lower:
            # Replace an exact predecessor rejected count where it is explicit.
            line = re.sub(
                rf"(?<!\d){max(0, rejected - 0)}(?!\d)",
                str(rejected),
                line,
            )
        if "in_flight" in lower or "in-flight" in lower or "active" in lower:
            line = re.sub(r"(?<!\d)0(?!\d)", "0", line)
        patched_lines.append(line)
    text = "\n".join(patched_lines) + "\n"

    # Normalize evidence scope. This intentionally does not add any maker credit.
    evidence_sentence = (
        f"The frozen {character} source identifies {performer} as the role’s voice performer. "
        f"This supports a voice-only performance claim limited to {character}; physical performance, "
        "animation, character design, voice direction, editing, sound processing, production-shop, "
        "vocal-transformation, and other maker labor remain unresolved."
    )
    text = re.sub(
        r"The frozen [^\n\"]+ source identifies [^\n\"]+?(?=(?:\"|'))",
        evidence_sentence,
        text,
    )
    text = text.replace(
        f"{old_character} and the other separately receipted roles remain distinct from {character}",
        f"{old_character} and the other separately receipted roles remain distinct from {character}",
    )

    if new_name == f"{unit}-stage.mjs":
        text = re.sub(r"year:\s*\d{4},", f"year: {portrait_year},", text)
        text = re.sub(
            r"fetched_at:\s*['\"]\d{4}-\d{2}-\d{2}['\"]",
            f"fetched_at: '{fetched_at}'",
            text,
        )

    destination = programs / new_name
    destination.write_text(text)
    if destination.suffix == ".sh":
        destination.chmod(0o755)

all_text = "\n".join(path.read_text() for path in sorted(programs.iterdir()))
for forbidden in (
    old_task_id,
    old_fingerprint,
    old_wall,
    old_unit,
    f"star-trek-{old_slug}-media-v1",
):
    if forbidden in all_text:
        fail(f"rolling controller retained forbidden predecessor target binding: {forbidden}")
for required in (
    task_id,
    fingerprint,
    parent,
    wall,
    character,
    performer,
    source,
    still_origin,
    portrait_origin,
    old_receipt_rel,
    old_checker_rel,
    "star-trek-rolling-media-v1",
):
    if required not in all_text:
        fail(f"rolling controller lost required binding: {required}")
for required_file in (
    f"{unit}-stage.mjs",
    f"{unit}-review.mjs",
    f"{unit}-finalize.mjs",
):
    text = (programs / required_file).read_text()
    if task_id not in text or fingerprint not in text or wall not in text:
        fail(f"{required_file} lacks exact task binding")

manifest = {
    "version": 1,
    "transaction": "STAR-TREK-ROLLING-CONTROLLER-REBINDING-V1",
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
        "star_trek": {
            "total": len(trek),
            "queued_before": queued,
            "queued_after": queued - 1,
            "resolved_before": resolved,
            "resolved_after": resolved + 1,
            "rejected": rejected,
            "in_flight": 0,
        },
        "wall": {"before": len(specimens), "after": len(specimens) + 1},
        "media": {
            "facets_before": len(trek_facets),
            "facets_after": len(trek_facets) + 2,
            "verified_before": verified,
            "verified_after": verified + 2,
            "honest_absences": honest_absences,
        },
    },
    "media": {
        "still_origin": still_origin,
        "still_source_page": still_page,
        "portrait_origin": portrait_origin,
        "portrait_author": portrait_author,
        "portrait_license": portrait_license,
        "portrait_year": portrait_year,
    },
    "prior": {
        "task_id": old_task_id,
        "character": old_character,
        "performer": old_performer,
        "receipt_path": old_receipt_rel,
        "receipt_file_sha256": old_receipt_file_sha,
        "receipt_identity": old_receipt_identity,
        "checker_path": old_checker_rel,
        "checker_sha256": old_checker_sha,
        "cycle_id": old_cycle_id,
    },
    "source_controller": {
        "manifest_sha256": sha_file(source_manifest_path),
        "task_id": old_task_id,
        "slug": old_slug,
        "unit_slug": old_unit,
    },
    "files": [
        {"file": path.name, "bytes": path.stat().st_size, "sha256": sha_file(path)}
        for path in sorted(programs.iterdir())
    ],
}
(output_root / "controller-source-manifest.json").write_text(pretty(manifest))
print(json.dumps(manifest, indent=2, ensure_ascii=False))
