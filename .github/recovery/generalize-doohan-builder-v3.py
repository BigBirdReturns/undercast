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

flag_pattern = re.compile(
    r"(?m)^(?P<indent>\s*)'karl_four_role_not_conflated': True,\s*$"
)
flag_matches = list(flag_pattern.finditer(text))
if len(flag_matches) != 1:
    raise SystemExit(f"prior-role flag marker drifted: {len(flag_matches)}")
text = flag_pattern.sub(
    lambda match: (
        f"{match.group('indent')}'kol_tai_role_not_conflated': True,\n"
        f"{match.group('indent')}'karl_four_role_not_conflated': True,"
    ),
    text,
    count=1,
)

reveal_anchor = "    'The exact role-specific still is retained as character evidence, while a separately sourced '\n"
boundary_line = "    'Kol-Tai remains a separately bounded James Doohan role. '\n"
anchor_count = text.count(reveal_anchor)
if anchor_count != 1:
    raise SystemExit(f"reveal boundary anchor drifted: {anchor_count}")
text = text.replace(reveal_anchor, boundary_line + reveal_anchor, 1)

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
    "Kol-Tai remains a separately bounded James Doohan role.",
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
        "status": "generalized-v3",
        "target": target_character,
        "wall_id": wall_id,
        "priority": priority,
        "role_flag_insertions": len(flag_matches),
        "boundary_sentence_insertions": anchor_count,
    }
)
