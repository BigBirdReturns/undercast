#!/usr/bin/env python3
"""Build an isolated UC-170 discoverer with exact MediaWiki title normalization."""
from __future__ import annotations

import json
from pathlib import Path

SOURCE = Path("scripts/card-backfill-uc-170-discover-v2.mjs")
DEST = Path("scripts/.card-backfill-uc-170-discover-run.mjs")
CONTROL = Path(".github/CARD-BACKFILL-UC-170-DISCOVER.json")
FAILURES = Path(".github/CARD-BACKFILL-UC-170-DISCOVER-FAILURES.json")


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"UC-170 v3 repair anchor count {name}: {count}")
    return text.replace(old, new, 1)


control = json.loads(CONTROL.read_text(encoding="utf-8"))
failures = json.loads(FAILURES.read_text(encoding="utf-8"))
rows = failures.get("failed_discovery_checkpoints", [])
kif = next((row for row in control.get("roles", []) if row.get("key") == "kif"), None)
rule = (kif or {}).get("generic_width_floor_exception", {})
if (
    failures.get("version") != 1
    or failures.get("record_id") != "UC-170"
    or len(rows) != 3
    or rows[0].get("artifact_id") != 8712519412
    or rows[1].get("artifact_id") != 8712595529
    or rows[2].get("artifact_id") != 8712903593
    or rows[2].get("head_sha") != "287c31f9d58beaac484b2eb969872c955ef0e258"
    or rows[2].get("artifact_digest_sha256") != "778f4fa500d0fac39f3895021a9f8419c57a9e91465a9eac62520643beff28e5"
):
    raise SystemExit("UC-170 three-failure custody drift")
if (
    control.get("version") != 1
    or control.get("record_id") != "UC-170"
    or rule.get("required_file_title") != "File:Character Kif.png"
    or rule.get("required_normalized_pageimage_title") != "File:Character Kif.png"
    or rule.get("required_pageimage_source") is not True
    or rule.get("required_width") != 144
    or rule.get("required_height") != 444
    or rule.get("required_mime") != "image/webp"
    or rule.get("required_bytes") != 12104
    or rule.get("required_sha256") != "5261c4cddb408a3f18f2bc8c321ff8f7ad6edfcdc82c66cb614e82ec672f2f2e"
    or rule.get("generic_width_floor") != 180
):
    raise SystemExit("UC-170 exact Kif exception control drift")

text = SOURCE.read_text(encoding="utf-8")
text = replace_once(
    text,
    """function isExactKifException(role, title, pageimageSource, width, height) {
  const rule = role.generic_width_floor_exception;
  if (role.key !== 'kif' || !rule) return false;
  return title === rule.required_file_title && pageimageSource === true && width === rule.required_width && height === rule.required_height;
}
""",
    """function normalizedFileTitle(value) {
  const text = String(value || '').replace(/_/g, ' ').replace(/^file:/i, 'File:').replace(/\\s+/g, ' ').trim();
  return text;
}
function isSameFileTitle(left, right) {
  return norm(normalizedFileTitle(left)) === norm(normalizedFileTitle(right));
}
function isExactKifException(role, title, pageimageSource, width, height, mime, byteCount, hash) {
  const rule = role.generic_width_floor_exception;
  if (role.key !== 'kif' || !rule) return false;
  return isSameFileTitle(title, rule.required_file_title) &&
    pageimageSource === true &&
    width === rule.required_width &&
    height === rule.required_height &&
    mime === rule.required_mime &&
    byteCount === rule.required_bytes &&
    hash === rule.required_sha256;
}
""",
    "file-title normalization helper",
)
text = replace_once(
    text,
    """  const filtered = titles.filter(title => !isForbiddenTitle(role, title) && (isRequiredTitle(role, title) || title === pageimageTitle));
""",
    """  const filtered = titles.filter(title => !isForbiddenTitle(role, title) && (isRequiredTitle(role, title) || isSameFileTitle(title, pageimageTitle)));
""",
    "filtered pageimage identity",
)
text = replace_once(
    text,
    """      const dimensions = identify(path, mime);
      const exception = isExactKifException(role, source.page.title, source.pageimage_source, dimensions.width, dimensions.height);
      const passesGeneralFloor = dimensions.width >= control.minimum_width && dimensions.height >= control.minimum_height;
      if (!passesGeneralFloor && !exception) continue;
      return {
        local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions,
""",
    """      const dimensions = identify(path, mime);
      const hash = sha(bytes);
      const exception = isExactKifException(role, source.page.title, source.pageimage_source, dimensions.width, dimensions.height, mime, bytes.length, hash);
      const passesGeneralFloor = dimensions.width >= control.minimum_width && dimensions.height >= control.minimum_height;
      if (!passesGeneralFloor && !exception) continue;
      return {
        local, mime, bytes: bytes.length, sha256: hash, ...dimensions,
""",
    "hash-bound Kif exception",
)
text = replace_once(
    text,
    """      pageimage_source: title === pageimageTitle,
""",
    """      pageimage_source: isSameFileTitle(title, pageimageTitle),
""",
    "normalized pageimage source",
)
text = replace_once(
    text,
    """    const accepted = candidates.find(row => row.file_title === role.generic_width_floor_exception.required_file_title && row.pageimage_source === true && row.width === 144 && row.height === 444 && row.generic_width_floor_exception === true);
""",
    """    const rule = role.generic_width_floor_exception;
    const accepted = candidates.find(row => isSameFileTitle(row.file_title, rule.required_file_title) && row.pageimage_source === true && row.width === rule.required_width && row.height === rule.required_height && row.mime === rule.required_mime && row.bytes === rule.required_bytes && row.sha256 === rule.required_sha256 && row.generic_width_floor_exception === true);
""",
    "exact Kif accepted candidate",
)
text = replace_once(
    text,
    """    pageimage_title: pageimageTitle,
""",
    """    pageimage_title: pageimageTitle,
    normalized_pageimage_title: normalizedFileTitle(pageimageTitle),
""",
    "normalized pageimage receipt",
)
text = replace_once(
    text,
    """assert(failures.version === 1 && failures.record_id === 'UC-170' && failures.failed_discovery_checkpoints?.length === 2 && failures.failed_discovery_checkpoints[0]?.artifact_id === 8712519412 && failures.failed_discovery_checkpoints[1]?.artifact_id === 8712595529, 'UC-170 failed checkpoint custody drift');
""",
    """assert(failures.version === 1 && failures.record_id === 'UC-170' && failures.failed_discovery_checkpoints?.length === 3 && failures.failed_discovery_checkpoints[0]?.artifact_id === 8712519412 && failures.failed_discovery_checkpoints[1]?.artifact_id === 8712595529 && failures.failed_discovery_checkpoints[2]?.artifact_id === 8712903593, 'UC-170 failed checkpoint custody drift');
""",
    "three-failure script custody",
)
text = replace_once(
    text,
    """assert(control.selection_contract?.exact_three_role_animated_character_composite_required === true && JSON.stringify(control.selection_contract?.required_roles) === JSON.stringify(['brain','kif','egon']) && control.selection_contract?.minimum_candidates_per_role === 1 && control.selection_contract?.kif_exact_pageimage_width_exception_required === true && control.selection_contract?.kif_exact_pageimage_width === 144 && control.selection_contract?.kif_exact_pageimage_height === 444 && control.selection_contract?.generic_width_floor_remains_180 === true && control.selection_contract?.canonical_mutation === false, 'UC-170 selection contract drift');
""",
    """assert(control.selection_contract?.exact_three_role_animated_character_composite_required === true && JSON.stringify(control.selection_contract?.required_roles) === JSON.stringify(['brain','kif','egon']) && control.selection_contract?.minimum_candidates_per_role === 1 && control.selection_contract?.kif_exact_pageimage_width_exception_required === true && control.selection_contract?.kif_pageimage_title_normalization_required === true && control.selection_contract?.kif_exact_pageimage_width === 144 && control.selection_contract?.kif_exact_pageimage_height === 444 && control.selection_contract?.kif_exact_pageimage_mime === 'image/webp' && control.selection_contract?.kif_exact_pageimage_bytes === 12104 && control.selection_contract?.kif_exact_pageimage_sha256 === '5261c4cddb408a3f18f2bc8c321ff8f7ad6edfcdc82c66cb614e82ec672f2f2e' && control.selection_contract?.generic_width_floor_remains_180 === true && control.selection_contract?.canonical_mutation === false, 'UC-170 selection contract drift');
""",
    "exact-byte selection contract",
)
text = text.replace(
    """      pageimage_title: row.pageimage_title,
""",
    """      pageimage_title: row.pageimage_title,
      normalized_pageimage_title: row.normalized_pageimage_title,
""",
)
DEST.write_text(text, encoding="utf-8")
print(f"PASS — wrote isolated normalized UC-170 discoverer to {DEST}")
