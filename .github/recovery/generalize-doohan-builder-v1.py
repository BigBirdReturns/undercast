from __future__ import annotations

from pathlib import Path
import os
import re
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ["BUILDER_PATH"])
target_character = os.environ["TARGET_CHARACTER"]
target_source = os.environ["TARGET_SOURCE"]
target_slug = os.environ["TARGET_SLUG"]
target_unit = os.environ["TARGET_UNIT"]
target_upper = os.environ["TARGET_UPPER"]
wall_id = os.environ["WALL_ID"]
priority = int(os.environ["TASK_PRIORITY"])

text = path.read_text()
old_character = "Kol-Tai"
old_slug = "kol-tai"
old_unit = "koltai"
old_upper = "KOL-TAI"
old_wall = "UC-1389"

for before, after in (
    (old_upper, target_upper),
    (old_character, target_character),
    (old_slug, target_slug),
    (old_unit, target_unit),
    (old_wall, wall_id),
    (old_wall.lower(), wall_id.lower()),
):
    text = text.replace(before, after)

derived_source = "https://memory-alpha.fandom.com/wiki/" + target_character.replace(" ", "_")
if derived_source != target_source:
    text = text.replace(derived_source, target_source)

priority_pattern = re.compile(r"('priority':\s*)1340([,\n])")
text, priority_changes = priority_pattern.subn(rf"\g<1>{priority}\g<2>", text)
if priority_changes < 1:
    raise SystemExit("target priority binding marker drifted")

flag_marker = "            'karl_four_role_not_conflated': True,\n"
flag_insert = (
    "            'kol_tai_role_not_conflated': True,\n"
    + flag_marker
)
flag_count = text.count(flag_marker)
if flag_count < 1:
    raise SystemExit(f"prior-role flag marker drifted: {flag_count}")
text = text.replace(flag_marker, flag_insert)

role_prefix = "Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem"
expanded_prefix = "Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem"
if role_prefix not in text:
    raise SystemExit("separate-role prose marker drifted")
text = text.replace(role_prefix, expanded_prefix)

depiction_prefix = "rather than Karl Four, Cadmar, Cheeron, Ari bn Bem"
if depiction_prefix in text:
    text = text.replace(
        depiction_prefix,
        "rather than Kol-Tai, Karl Four, Cadmar, Cheeron, Ari bn Bem",
    )

required = (
    target_character,
    target_source,
    target_slug,
    target_unit,
    wall_id,
    "'kol_tai_role_not_conflated': True",
    expanded_prefix,
)
for needle in required:
    if needle not in text:
        raise SystemExit(f"generalized builder lost required binding: {needle}")

forbidden = (
    "ap_9e3a49dc256ff237dd30611b",
    "0476f56a4959105661f22140254bf364c76c4ace7ac513c111233c75e99cf9d2",
)
for needle in forbidden:
    if needle in text:
        raise SystemExit(f"generalized builder retained prior task binding: {needle}")

path.write_text(text)
print(
    {
        "status": "generalized",
        "target": target_character,
        "wall_id": wall_id,
        "priority": priority,
        "role_flag_insertions": flag_count,
    }
)
