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

# The immutable builder carries this boundary in exactly two independent
# custody objects: source receipt and media preparation. Both must preserve
# the Kol-Tai predecessor as a separately bounded identity.
flag_pattern = re.compile(
    r"(?m)^(?P<indent>\s*)'karl_four_role_not_conflated': True,\s*$"
)
flag_matches = list(flag_pattern.finditer(text))
if len(flag_matches) != 2:
    raise SystemExit(f"prior-role flag marker drifted: {len(flag_matches)}")
text, flag_changes = flag_pattern.subn(
    lambda match: (
        f"{match.group('indent')}'kol_tai_role_not_conflated': True,\n"
        f"{match.group('indent')}'karl_four_role_not_conflated': True,"
    ),
    text,
    count=2,
)
if flag_changes != 2:
    raise SystemExit(f"prior-role flag insertion drifted: {flag_changes}")

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

# Kukulkan's frozen role page carries both the canonical TAS episode and a
# later Lower Decks appearance. The generic score can therefore select a
# semantically related but wrong episode. Pin only after the exact TAS title
# is proved present in the role page's enumerated episode-link set.
if target_character == "Kukulkan":
    selector = (
        "episode_title = sorted(episode_titles, key=episode_score, reverse=True)[0]\n"
        "episode_name = episode_title.removesuffix(' (episode)')\n"
    )
    replacement = (
        "expected_episode_title = \"How Sharper Than a Serpent's Tooth (episode)\"\n"
        "if expected_episode_title not in episode_titles:\n"
        "    raise SystemExit(f'Kukulkan exact TAS episode link missing: {episode_titles}')\n"
        "episode_title = expected_episode_title\n"
        "episode_name = episode_title.removesuffix(' (episode)')\n"
    )
    if text.count(selector) != 1:
        raise SystemExit(f"Kukulkan episode selector marker drifted: {text.count(selector)}")
    text = text.replace(selector, replacement, 1)

    airdate_before = (
        "airdate = infobox_field(episode_text, ('airdate', 'original airdate', 'first aired'))\n"
    )
    airdate_after = (
        "airdate = infobox_field(episode_text, ("
        "'airdate', 'date', 'originalairdate', 'original airdate', "
        "'firstaired', 'first aired'))\n"
    )
    if text.count(airdate_before) != 1:
        raise SystemExit(f"Kukulkan airdate marker drifted: {text.count(airdate_before)}")
    text = text.replace(airdate_before, airdate_after, 1)

    receipt_anchor = "episode_receipts = [{\n"
    year_guard = (
        "if year != '1974':\n"
        "    raise SystemExit(f'Kukulkan exact TAS episode year drifted: {year}')\n\n"
    )
    if text.count(receipt_anchor) != 1:
        raise SystemExit(f"Kukulkan episode receipt marker drifted: {text.count(receipt_anchor)}")
    text = text.replace(receipt_anchor, year_guard + receipt_anchor, 1)

    # Source labels alone are insufficient because renamed Commons files can
    # serialize to the exact bytes already used by a canonical card. Hash the
    # deterministically normalized JPEG before accepting a portrait candidate.
    portrait_anchor = (
        "        selected = (portrait_title, portrait_data, portrait_page, portrait_info, ext, artist, "
        "license_short, description, portrait_origin, portrait_download_url, portrait_original, "
        "portrait_transport_size, portrait_transport_format)\n"
        "        break\n"
    )
    portrait_replacement = (
        "        candidate_buffer = BytesIO()\n"
        "        with Image.open(BytesIO(portrait_original)) as candidate_image:\n"
        "            candidate_portrait = candidate_image.convert('RGB')\n"
        "            candidate_portrait.thumbnail((1200, 1500), Image.Resampling.LANCZOS)\n"
        "            candidate_portrait.save(candidate_buffer, format='JPEG', quality=94, optimize=True, progressive=False)\n"
        "        candidate_portrait_sha = h_bytes(candidate_buffer.getvalue())\n"
        "        canonical_portrait_collisions = [\n"
        "            canonical_path.name\n"
        "            for canonical_path in (repo / 'images').glob('*-portrait.*')\n"
        "            if canonical_path.is_file() and h_file(canonical_path) == candidate_portrait_sha\n"
        "        ]\n"
        "        if canonical_portrait_collisions:\n"
        "            selection_errors.append({\n"
        "                'title': portrait_title,\n"
        "                'error': f'canonical portrait byte collision: {canonical_portrait_collisions}',\n"
        "            })\n"
        "            continue\n"
        + portrait_anchor
    )
    if text.count(portrait_anchor) != 1:
        raise SystemExit(f"Kukulkan portrait selection marker drifted: {text.count(portrait_anchor)}")
    text = text.replace(portrait_anchor, portrait_replacement, 1)

required = (
    target_character,
    target_source,
    target_slug,
    target_unit,
    wall_id,
    "Kol-Tai remains a separately bounded James Doohan role.",
)
for needle in required:
    if needle not in text:
        raise SystemExit(f"generalized builder lost required binding: {needle}")
if text.count("'kol_tai_role_not_conflated': True") != 2:
    raise SystemExit("generalized builder lost dual Kol-Tai custody flags")

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
        "status": "generalized-v6",
        "target": target_character,
        "wall_id": wall_id,
        "priority": priority,
        "role_flag_insertions": flag_changes,
        "boundary_sentence_insertions": anchor_count,
        "episode_binding": (
            "How Sharper Than a Serpent's Tooth (episode)"
            if target_character == "Kukulkan"
            else "generic"
        ),
        "portrait_gate": (
            "canonical-normalized-byte-exclusion"
            if target_character == "Kukulkan"
            else "generic"
        ),
    }
)
