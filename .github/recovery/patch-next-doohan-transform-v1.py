from __future__ import annotations

from pathlib import Path
import os
import re
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ["TRANSFORM_PATH"])
target_character = os.environ["TARGET_CHARACTER"]
target_slug = os.environ["TARGET_SLUG"]
target_unit = os.environ["TARGET_UNIT"]
target_upper = os.environ["TARGET_UPPER"]
wall_id = os.environ["WALL_ID"]
task_id = os.environ["TASK_ID"]
fingerprint = os.environ["TASK_FINGERPRINT"]

current_character = "Kol-Tai"
current_slug = "kol-tai"
current_unit = "koltai"
current_upper = "KOL-TAI"
current_wall = "UC-1389"
prior_character = "Karl Four"
prior_slug = "karl-four"
prior_unit = "karl_four"
prior_upper = "KARL-FOUR"

text = path.read_text()

def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker drifted: {count}")
    text = text.replace(old, new, 1)

replace_once(
    "old_cycle = json.loads((repo / 'data/review/adapter-sdk/star-trek-domar-cycle.json').read_text())",
    "old_cycle = json.loads((repo / 'data/review/adapter-sdk/star-trek-kol-tai-cycle.json').read_text())",
    "current cycle path",
)

text, task_id_changes = re.subn(
    r"if new_task\['id'\] != '[^']+':",
    f"if new_task['id'] != '{task_id}':",
    text,
    count=1,
)
text, fingerprint_changes = re.subn(
    r"if new_task\['source_fingerprint'\] != '[^']+':",
    f"if new_task['source_fingerprint'] != '{fingerprint}':",
    text,
    count=1,
)
if task_id_changes != 1 or fingerprint_changes != 1:
    raise SystemExit(
        f"target task guards drifted: task={task_id_changes} fingerprint={fingerprint_changes}"
    )

media_guard_pattern = re.compile(
    r"if new_media\['still'\]\['src'\] != 'images/uc-1389-still\.webp' "
    r"or new_media\['portrait'\]\['src'\] != 'images/uc-1389-portrait\.jpg':"
)
text, media_guard_changes = media_guard_pattern.subn(
    "if new_media['still']['src'] != "
    f"'images/{wall_id.lower()}-still.webp' "
    "or new_media['portrait']['src'] != "
    f"'images/{wall_id.lower()}-portrait.jpg':",
    text,
    count=1,
)
if media_guard_changes != 1:
    raise SystemExit(f"target media guard drifted: {media_guard_changes}")

replace_once(
    "prior_receipt = repo / 'data/review/adapter-sdk/star-trek-karl-four-cycle.json'",
    "prior_receipt = repo / 'data/review/adapter-sdk/star-trek-kol-tai-cycle.json'",
    "prior receipt path",
)
replace_once(
    "prior_checker = repo / 'scripts/star-trek-karl-four-cycle.mjs'",
    "prior_checker = repo / 'scripts/star-trek-kol-tai-cycle.mjs'",
    "prior checker path",
)
replace_once(
    "if prior_cycle['canonical']['record']['character'] != 'Karl Four':",
    "if prior_cycle['canonical']['record']['character'] != 'Kol-Tai':",
    "prior character guard",
)

program_pattern = re.compile(
    r"program_sources = \{\n.*?\n\}\noutput_names = \{\n.*?\n\}\n",
    re.S,
)
program_replacement = f"""program_sources = {{
    'controller': one(template, 'unitkoltai-controller.sh'),
    'finalize': one(template, 'unitkoltai-finalize.mjs'),
    'prior': one(template, 'unitkoltai-prior-phase.mjs'),
    'review': one(template, 'unitkoltai-review.mjs'),
    'stage': one(template, 'unitkoltai-stage.mjs'),
}}
output_names = {{
    'controller': 'unit{target_unit}-controller.sh',
    'finalize': 'unit{target_unit}-finalize.mjs',
    'prior': 'unit{target_unit}-prior-phase.mjs',
    'review': 'unit{target_unit}-review.mjs',
    'stage': 'unit{target_unit}-stage.mjs',
}}
"""
text, program_changes = program_pattern.subn(program_replacement, text, count=1)
if program_changes != 1:
    raise SystemExit(f"program source/output block drifted: {program_changes}")

explicit_marker = "    str(template_manifest.get('media_sha256', '')): prep_digest,\n"
explicit_insert = (
    explicit_marker
    + "    str(template_manifest.get('media_run', '')): str(prep_run),\n"
    + "    str(template_manifest.get('media_job', '')): str(prep_job),\n"
)
if text.count(explicit_marker) != 1:
    raise SystemExit("template media custody marker drifted")
text = text.replace(explicit_marker, explicit_insert, 1)

count_pattern = re.compile(
    r"number_map = \{\n.*?\n\}\nformatted_map = \{\n.*?\n\}\n",
    re.S,
)
count_replacement = """number_map = {
    '1807': '1806', '1806': '1805',
    '420': '421', '421': '422',
}
formatted_map = {
    '1,807': '1,806', '1,806': '1,805',
}
"""
text, count_changes = count_pattern.subn(count_replacement, text, count=1)
if count_changes != 1:
    raise SystemExit(f"queue count block drifted: {count_changes}")

transform_pattern = re.compile(
    r"def transform\(text: str\) -> str:\n"
    r"    replacements = \[\n.*?\n"
    r"    \]\n"
    r"    field_placeholders = \[",
    re.S,
)
transform_replacement = f"""def transform(text: str) -> str:
    flag_placeholders = [
        ('karl_four_role_not_conflated', '__ROLE_FLAG_0__'),
        ('domar_role_not_conflated', '__ROLE_FLAG_1__'),
        ('chuft_captain_role_not_conflated', '__ROLE_FLAG_2__'),
        ('cadmar_role_not_conflated', '__ROLE_FLAG_3__'),
    ]
    for before, token in flag_placeholders:
        text = text.replace(before, token)
    replacements = [
        ('unitkoltai', 'unit{target_unit}'),
        ('UNITKOLTAI', 'UNIT{target_unit.upper()}'),
        ('{current_character}', '{target_character}'),
        ('{current_slug}', '{target_slug}'),
        ('{current_upper}', '{target_upper}'),
        ('{current_wall}', '{wall_id}'),
        ('{current_wall.lower()}', '{wall_id.lower()}'),
        ('{prior_character}', '{current_character}'),
        ('{prior_slug}', '{current_slug}'),
        ('{prior_upper}', '{current_upper}'),
        ('{prior_unit}', 'kol_tai'),
        (old_task['id'], new_task['id']),
        (old_task['source_fingerprint'], new_task['source_fingerprint']),
        (old_cycle['canonical_parent'], expected_main),
    ]
    field_placeholders = ["""
text, transform_changes = transform_pattern.subn(
    transform_replacement, text, count=1
)
if transform_changes != 1:
    raise SystemExit(f"transform replacement block drifted: {transform_changes}")

replace_once(
    "    text = text.replace('The Ambergris Element', new_task['episode'])",
    "    text = text.replace(str(old_task['episode']), str(new_task['episode']))",
    "episode replacement",
)
replace_once(
    "    text = text.replace('1973', str(new_task['years']))",
    "    text = text.replace(str(old_task['years']), str(new_task['years']))",
    "year replacement",
)

return_anchor = """    for token, after in field_restore:
        text = text.replace(token, after)
    return text
"""
return_replacement = """    for token, after in field_restore:
        text = text.replace(token, after)
    flag_restore = [
        ('__ROLE_FLAG_0__', 'kol_tai_role_not_conflated'),
        ('__ROLE_FLAG_1__', 'karl_four_role_not_conflated'),
        ('__ROLE_FLAG_2__', 'domar_role_not_conflated'),
        ('__ROLE_FLAG_3__', 'chuft_captain_role_not_conflated'),
    ]
    for token, after in flag_restore:
        text = text.replace(token, after)
    text = text.replace(
        'Kol-Tai, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem',
        'Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem',
    )
    return text
"""
replace_once(return_anchor, return_replacement, "transform return")

text = text.replace(
    "if 'UC-1387' in text or 'uc-1387-' in text:",
    "if 'UC-1389' in text or 'uc-1389-' in text:",
)
text = text.replace(
    "if 'Star Trek: publish Domar cycle' in text:",
    "if 'Star Trek: publish Kol-Tai cycle' in text:",
)
queue_residue_pattern = re.compile(
    r"    if '1,809 tasks remain queued' in text or '1,808 tasks remain queued' in text:\n"
    r"        raise SystemExit\(f'Domar queue residue in \{path\.name\}'\)"
)
text, queue_residue_changes = queue_residue_pattern.subn(
    "    if '1,807 tasks remain queued' in text:\n"
    "        raise SystemExit(f'Kol-Tai queue residue in {path.name}')",
    text,
    count=1,
)
if queue_residue_changes != 1:
    raise SystemExit(f"queue residue guard drifted: {queue_residue_changes}")

head, separator, tail = text.partition("required = {")
if not separator:
    raise SystemExit("required validation block is missing")

prior_count_token = "__PRIOR_QUEUE_COUNT__"
final_count_token = "__FINAL_QUEUE_COUNT__"
tail = tail.replace("'1,807 tasks remain queued'", f"'{prior_count_token}'")
tail = tail.replace("'1,806 tasks remain queued'", f"'{final_count_token}'")
for before, after in (
    ("unitkoltai", f"unit{target_unit}"),
    ("UNITKOLTAI", f"UNIT{target_unit.upper()}"),
    ("KOL-TAI", target_upper),
    ("Kol-Tai", target_character),
    ("kol-tai", target_slug),
    ("UC-1389", wall_id),
    ("uc-1389", wall_id.lower()),
):
    tail = tail.replace(before, after)
tail = tail.replace(prior_count_token, "1,806 tasks remain queued")
tail = tail.replace(final_count_token, "1,805 tasks remain queued")
text = head + separator + tail

required_source = (
    f"'unit{target_unit}-controller.sh'",
    f"'unit{target_unit}-stage.mjs'",
    f"'unit{target_unit}-prior-phase.mjs'",
    f"'unit{target_unit}-finalize.mjs'",
    f"'images/{wall_id.lower()}-still.webp'",
    f"'images/{wall_id.lower()}-portrait.jpg'",
    f"'Star Trek: publish {target_character} cycle'",
    f"'STAR-TREK-{target_upper}-CONTROLLER-SOURCE-V1'",
    "'1,806 tasks remain queued'",
    "'1,805 tasks remain queued'",
)
for needle in required_source:
    if needle not in text:
        raise SystemExit(f"patched transformer lost required source binding: {needle}")

path.write_text(text)
print(
    {
        "status": "patched",
        "target": target_character,
        "wall_id": wall_id,
        "task_id": task_id,
        "fingerprint": fingerprint,
    }
)
