from __future__ import annotations

from pathlib import Path
import hashlib
import json
import re
import shutil
import sys

if len(sys.argv) != 5:
    raise SystemExit("usage: kzinti-flyer-cycle-controller-rebind-v1.py <source-programs> <output-root> <preparation-root> <repo-root>")

source_programs = Path(sys.argv[1]).resolve()
output_root = Path(sys.argv[2]).resolve()
preparation = Path(sys.argv[3]).resolve()
repo = Path(sys.argv[4]).resolve()
programs = output_root / "programs"

TASK_ID = "ap_8f2b1b123aa02bbbb27d00b4"
OLD_TASK = "ap_8aa8780eda59987cb5a1de36"
OLD_FINGERPRINT = "77f5acaf275c3880b0f0139d0726789eefeff1cf7de1710f00e9d1bca4427b9c"
OLD_PARENT = "af8c0891b38275889bc90ca76af763ce6dd9b59c"
OLD_WALL = "UC-1390"
WALL = "UC-1391"


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


def replace_number(text: str, old: str, token: str) -> str:
    return re.sub(rf"(?<![0-9A-Za-z]){re.escape(old)}(?![0-9A-Za-z])", token, text)


def replace_const(text: str, name: str, value) -> tuple[str, int]:
    literal = json.dumps(value, ensure_ascii=False)
    pattern = re.compile(rf"^(const\s+{re.escape(name)}\s*=\s*).*?;\s*$", re.M)
    return pattern.subn(lambda match: match.group(1) + literal + ";", text)


media = json.loads((preparation / "media-preparation.json").read_text())
probe = json.loads((preparation / "source-probe.json").read_text())
autopilot = json.loads((repo / "data/AUTOPILOT.json").read_text())
tasks = [row for row in autopilot["jobs"] if row.get("id") == TASK_ID]
if len(tasks) != 1:
    fail(f"Kzinti Flyer task cardinality drifted: {len(tasks)}")
task = tasks[0]
parent = media["canonical_parent"]
fingerprint = task["source_fingerprint"]
source = task["source"]
production = task.get("production") or "Star Trek: The Animated Series"
years = str(task.get("years") or "1973")
episode = production
match = re.search(r"\(([^()]*)\)\s*$", production)
if match:
    episode = match.group(1)

if probe.get("canonical_parent") != parent or media.get("canonical_parent") != parent:
    fail("Kzinti Flyer preparation parent drifted")
if probe.get("task_id") != TASK_ID or media.get("task_id") != TASK_ID:
    fail("Kzinti Flyer preparation task drifted")
if probe.get("source_fingerprint") != fingerprint or media.get("source_fingerprint") != fingerprint:
    fail("Kzinti Flyer preparation fingerprint drifted")
if media.get("wall_id") != WALL or media.get("performance_mode") != "voice-only":
    fail("Kzinti Flyer media adjudication drifted")
if media.get("maker_attribution") != "unresolved" or media.get("media_review", {}).get("verdict") != "pass":
    fail("Kzinti Flyer media review drifted")

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

prior_receipts = []
for path in (repo / "data/review/adapter-sdk").glob("star-trek-lwaxana*.json"):
    try:
        value = json.loads(path.read_text())
    except Exception:
        continue
    payload = json.dumps(value, ensure_ascii=False)
    if "ap_a65494e8328ca262d82a49c0" in payload and "rejected" in payload:
        prior_receipts.append((path, value))
if len(prior_receipts) != 1:
    fail(f"Lwaxana rejection receipt cardinality drifted: {[str(row[0]) for row in prior_receipts]}")
prior_receipt_path, prior_receipt = prior_receipts[0]
prior_checkers = []
for path in (repo / "scripts").glob("star-trek-lwaxana*.mjs"):
    text = path.read_text(errors="replace")
    if "ap_a65494e8328ca262d82a49c0" in text and "rejected" in text:
        prior_checkers.append(path)
if len(prior_checkers) != 1:
    fail(f"Lwaxana rejection checker cardinality drifted: {[str(path) for path in prior_checkers]}")
prior_checker_path = prior_checkers[0]
prior_receipt_rel = str(prior_receipt_path.relative_to(repo))
prior_checker_rel = str(prior_checker_path.relative_to(repo))
prior_receipt_file_sha = sha_file(prior_receipt_path)
prior_receipt_identity = prior_receipt.get("receipt_sha256") or prior_receipt_file_sha
prior_checker_sha = sha_file(prior_checker_path)
prior_cycle_id = (prior_receipt.get("reviewed_cycle") or {}).get("id")
if not prior_cycle_id:
    fail("Lwaxana rejection cycle identity missing")

names = {
    "unitkukulkan-controller.sh": "unitkzinti-flyer-controller.sh",
    "unitkukulkan-stage.mjs": "unitkzinti-flyer-stage.mjs",
    "unitkukulkan-review.mjs": "unitkzinti-flyer-review.mjs",
    "unitkukulkan-prior-phase.mjs": "unitkzinti-flyer-prior-phase.mjs",
    "unitkukulkan-finalize.mjs": "unitkzinti-flyer-finalize.mjs",
}
if output_root.exists():
    shutil.rmtree(output_root)
programs.mkdir(parents=True)

number_mapping = {
    "1358": "1359",
    "1359": "1360",
    "942": "944",
    "944": "946",
    "669": "671",
    "671": "673",
    "471": "472",
    "472": "473",
    "1163": "1164",
    "1164": "1165",
    "762": "763",
    "763": "764",
    "1016": "1017",
    "1017": "1018",
    "786": "787",
    "787": "788",
    "5871": "5870",
}

for old_name, new_name in names.items():
    src = source_programs / old_name
    if not src.is_file():
        fail(f"sealed Kukulkan controller program missing: {old_name}")
    text = src.read_text()

    # Preserve prior-role prose while rebinding the controller target.
    text = text.replace("Kol-Tai", "__OLD_KOL_TAI__")
    text = text.replace("kol-tai", "__old_kol_tai__")
    text = text.replace("KOL_TAI", "__OLD_KOL_TAI_UP__")
    text = text.replace("Karl Four", "__OLD_KARL_FOUR__")
    text = text.replace("karl-four", "__old_karl_four__")
    text = text.replace("KARL_FOUR", "__OLD_KARL_FOUR_UP__")

    basic = [
        (OLD_PARENT, parent),
        (OLD_TASK, TASK_ID),
        (OLD_FINGERPRINT, fingerprint),
        (OLD_WALL, WALL),
        ("https://memory-alpha.fandom.com/wiki/Kukulkan", source),
        ("https://memory-alpha.fandom.com/wiki/How_Sharper_Than_a_Serpent%27s_Tooth_(episode)", source),
        ("https://static.wikia.nocookie.net/memoryalpha/images/c/c2/Kukulkan.jpg/revision/latest?cb=20061124010215&path-prefix=en", still_origin),
        ("https://memory-alpha.fandom.com/wiki/File:Kukulkan.jpg", still_page),
        ("https://commons.wikimedia.org/wiki/File:James_Doohan_-_Walk_of_Fame_-_July_21_2005.jpg", portrait_origin),
        ("8bd855653a81825dafe71625d0efd5bae08f6cffe69f72e68dce145f541c6fef", probe["receipt_sha256"]),
        ("08ab416504ed4e8123fbbb0768202b9de333a0a326026f6e367363407ec394a1", media["facets_sha256"]),
        ("star-trek-kukulkan-media-v6", "star-trek-kzinti-flyer-media-v1"),
        ("star-trek-kukulkan-media-v1", "star-trek-kzinti-flyer-media-v1"),
        ("unitkukulkan", "unitkzinti-flyer"),
        ("KUKULKAN", "KZINTI_FLYER"),
        ("kukulkan", "kzinti-flyer"),
        ("Kukulkan", "Kzinti Flyer"),
        ("How Sharper Than a Serpent's Tooth", episode),
        ("Star Trek: The Animated Series (How Sharper Than a Serpent's Tooth)", production),
        ("1974", years),
        ("High Tribune and head of the Ruling Tribunal of the Unknowns", "Kzinti pilot"),
        ("Unknown Teacher", "Kzinti pilot"),
        ("AllyUnion", portrait_author),
        ("CC BY-SA 3.0", portrait_license),
    ]
    for old, new in basic:
        text = text.replace(old, str(new))

    text = text.replace("__OLD_KOL_TAI__", "Kol-Tai")
    text = text.replace("__old_kol_tai__", "kol-tai")
    text = text.replace("__OLD_KOL_TAI_UP__", "KOL_TAI")
    text = text.replace("__OLD_KARL_FOUR__", "Karl Four")
    text = text.replace("__old_karl_four__", "karl-four")
    text = text.replace("__OLD_KARL_FOUR_UP__", "KARL_FOUR")

    # Rebind explicit constants where present.
    for const_name, value in (
        ("MAIN", parent),
        ("CANONICAL_PARENT", parent),
        ("EXPECTED_MAIN", parent),
        ("TASK", TASK_ID),
        ("TASK_ID", TASK_ID),
        ("FINGERPRINT", fingerprint),
        ("TASK_FINGERPRINT", fingerprint),
        ("WALL", WALL),
        ("WALL_ID", WALL),
        ("PERFORMER", "James Doohan"),
        ("ROLE", "Kzinti Flyer"),
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

    # Bind the immediate Lwaxana rejection predecessor by semantic constant names.
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
    text = re.sub(r"scripts/star-trek-(?:kol-tai|karl-four)-cycle\.mjs", prior_checker_rel, text)

    prose_replacements = [
        ("prior Kol-Tai custody", "prior Lwaxana rejection custody"),
        ("immutable prior Kol-Tai and prior Star Trek custody", "immutable prior Lwaxana rejection and prior Star Trek custody"),
        ("immutable Kol-Tai predecessor custody", "immutable Lwaxana rejection predecessor custody"),
        ("Kzinti Flyer, Cadmar, Cheeron, and Ari bn Bem remain separate Doohan roles", "Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, Ari bn Bem, and the other animated Doohan roles remain separate identities"),
        ("Kzinti Flyer, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separate James Doohan roles", "Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, Ari bn Bem, and the other animated Doohan roles remain separate James Doohan identities"),
        ("separate Kzinti Flyer, Cadmar, Cheeron, and Ari bn Bem custody", "separate Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem custody"),
        ("The frozen role source identifies James Doohan in Kzinti Flyer’s voice-performer field and separately names his voice performance in the role prose.", "The frozen Kzinti Flyer source identifies James Doohan as the role’s voice performer. This supports a voice-only performance claim for Kzinti Flyer and does not transfer physical performance, animation, design, direction, editing, sound processing, production-shop, vocal-transformation, or other maker labor to Doohan."),
        ("A Kzinti Flyer in", "Kzinti Flyer, the animated Kzinti pilot in"),
    ]
    for old, new in prose_replacements:
        text = text.replace(old, new)

    # Shift the source controller's product-accounting constants to the next card.
    placeholders = {}
    for index, (old, new) in enumerate(number_mapping.items()):
        token = f"__KZ_NUM_{index}__"
        text = replace_number(text, old, token)
        placeholders[token] = new
    for token, value in placeholders.items():
        text = text.replace(token, value)

    # Queue and resolution counts include the intervening Lwaxana rejection.
    queue_map = {"1806": "1804", "1805": "1803", "421": "422", "422": "423"}
    placeholders = {}
    for index, (old, new) in enumerate(queue_map.items()):
        token = f"__KZ_QUEUE_{index}__"
        text = replace_number(text, old, token)
        placeholders[token] = new
    for token, value in placeholders.items():
        text = text.replace(token, value)
    repaired = []
    for line in text.splitlines():
        lower = line.lower()
        if "rejected" in lower:
            line = re.sub(r"(?<!\d)1(?!\d)", "2", line)
        repaired.append(line)
    text = "\n".join(repaired) + "\n"

    if new_name == "unitkzinti-flyer-stage.mjs":
        text = re.sub(r"year:\s*\d{4},", f"year: {portrait_year},", text)
        text = re.sub(r"fetched_at:\s*['\"]\d{4}-\d{2}-\d{2}['\"]", f"fetched_at: '{fetched_at}'", text)

    destination = programs / new_name
    destination.write_text(text)
    if destination.suffix == ".sh":
        destination.chmod(0o755)

all_text = "\n".join(path.read_text() for path in sorted(programs.iterdir()))
for forbidden in (OLD_TASK, OLD_FINGERPRINT, OLD_PARENT, OLD_WALL, "unitkukulkan", "star-trek-kukulkan-media-v6"):
    if forbidden in all_text:
        fail(f"rebound Kzinti Flyer controller retained forbidden target residue: {forbidden}")
for required in (TASK_ID, fingerprint, parent, WALL, "Kzinti Flyer", source, still_origin, portrait_origin, prior_receipt_rel, prior_checker_rel, "star-trek-kzinti-flyer-media-v1"):
    if required not in all_text:
        fail(f"rebound Kzinti Flyer controller lost required binding: {required}")
for required_file in ("unitkzinti-flyer-stage.mjs", "unitkzinti-flyer-review.mjs", "unitkzinti-flyer-finalize.mjs"):
    text = (programs / required_file).read_text()
    if TASK_ID not in text or fingerprint not in text or WALL not in text:
        fail(f"{required_file} lacks exact task binding")

manifest = {
    "version": 1,
    "transaction": "STAR-TREK-KZINTI-FLYER-CONTROLLER-EXECUTION-REBINDING-V1",
    "status": "applied",
    "canonical_parent": parent,
    "task_id": TASK_ID,
    "source_fingerprint": fingerprint,
    "wall_id": WALL,
    "source_probe_sha256": probe["receipt_sha256"],
    "facets_sha256": media["facets_sha256"],
    "media": {
        "still_origin": still_origin,
        "still_source_page": still_page,
        "portrait_origin": portrait_origin,
        "portrait_author": portrait_author,
        "portrait_license": portrait_license,
        "portrait_year": portrait_year,
    },
    "prior": {
        "receipt_path": prior_receipt_rel,
        "receipt_file_sha256": prior_receipt_file_sha,
        "receipt_identity": prior_receipt_identity,
        "checker_path": prior_checker_rel,
        "checker_sha256": prior_checker_sha,
        "cycle_id": prior_cycle_id,
    },
    "files": [
        {"file": path.name, "bytes": path.stat().st_size, "sha256": sha_file(path)}
        for path in sorted(programs.iterdir())
    ],
}
(output_root / "controller-source-manifest.json").write_text(pretty(manifest))
print(json.dumps(manifest, indent=2, ensure_ascii=False))
