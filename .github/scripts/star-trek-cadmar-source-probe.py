#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
TASK_ID = "ap_65bf6ced3c2e53296254e943"
PERFORMER = "James Doohan"
ROLE = "Cadmar"
SOURCE = "https://memory-alpha.fandom.com/wiki/Cadmar"
FINGERPRINT = "abd29fcfe10e49b46727430ad7e5f83c86aaff31dc9c475ba22d3c31710e33e0"
EPISODE_TITLE = "The Ambergris Element (episode)"
EPISODE_SOURCE = "https://memory-alpha.fandom.com/wiki/The_Ambergris_Element_(episode)"
OUT = Path("/tmp/star-trek-cadmar-source-probe")
OUT.mkdir(parents=True, exist_ok=True)

def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def stable(value: Any) -> Any:
    if isinstance(value, list):
        return [stable(item) for item in value]
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    return value

def pretty(value: Any) -> str:
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"

def write(name: str, value: Any) -> None:
    path = OUT / name
    if isinstance(value, (dict, list)):
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    else:
        path.write_text(str(value))

def api(host: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode(params, doseq=True)
    request = urllib.request.Request(
        f"https://{host}/api.php?{query}",
        headers={"User-Agent": "undercast-cadmar-source-probe/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))

def revision_query(host: str, title: str) -> tuple[dict[str, Any], str]:
    payload = api(host, {
        "action": "query",
        "format": "json",
        "formatversion": 2,
        "redirects": 1,
        "prop": "revisions|pageimages|images",
        "rvprop": "ids|timestamp|content",
        "rvslots": "main",
        "piprop": "name|original",
        "imlimit": "max",
        "titles": title,
    })
    pages = payload.get("query", {}).get("pages", [])
    if len(pages) != 1 or pages[0].get("missing"):
        raise RuntimeError(f"missing page: {host}:{title}")
    page = pages[0]
    revisions = page.get("revisions", [])
    if len(revisions) != 1:
        raise RuntimeError(f"unexpected revision count: {host}:{title}")
    content = revisions[0].get("slots", {}).get("main", {}).get("content", "")
    if not isinstance(content, str) or not content:
        raise RuntimeError(f"empty revision content: {host}:{title}")
    return page, content

def image_query(host: str, title: str) -> dict[str, Any]:
    payload = api(host, {
        "action": "query",
        "format": "json",
        "formatversion": 2,
        "redirects": 1,
        "prop": "imageinfo|revisions",
        "iiprop": "url|size|sha1|mime|extmetadata",
        "rvprop": "ids|timestamp|content",
        "rvslots": "main",
        "titles": title,
    })
    pages = payload.get("query", {}).get("pages", [])
    if len(pages) != 1 or pages[0].get("missing"):
        raise RuntimeError(f"missing image page: {host}:{title}")
    return pages[0]

remote_main = subprocess.check_output(
    ["git", "ls-remote", "origin", "refs/heads/main"], text=True
).split()[0]
if remote_main != EXPECTED_MAIN:
    raise RuntimeError(f"main moved: expected {EXPECTED_MAIN}, got {remote_main}")

state = json.loads(Path("data/AUTOPILOT.json").read_text())
task = next((row for row in state["jobs"] if row.get("id") == TASK_ID), None)
if not task:
    raise RuntimeError("Cadmar task missing")
if not (
    task.get("status") == "queued"
    and task.get("performer") == PERFORMER
    and task.get("character") == ROLE
    and task.get("source_fingerprint") == FINGERPRINT
    and task.get("performance_modes") == ["voice-animation"]
    and task.get("sources") == [SOURCE]
):
    raise RuntimeError("Cadmar task rail binding drifted")

role_page, role_text = revision_query("memory-alpha.fandom.com", "Cadmar")
role_revision = role_page["revisions"][0]
role_receipt = {
    "source": SOURCE,
    "pageid": role_page["pageid"],
    "revision": role_revision["revid"],
    "timestamp": role_revision["timestamp"],
    "content_sha256": sha_bytes(role_text.encode("utf-8")),
}
if role_receipt not in task.get("source_receipts", []):
    raise RuntimeError(f"Cadmar frozen source receipt drifted: {role_receipt}")

actor_lines = [
    line.strip()
    for line in role_text.splitlines()
    if re.search(r"^\|\s*actor\s*=", line, re.I)
]
if not actor_lines or not any("James Doohan" in line for line in actor_lines):
    raise RuntimeError("Cadmar actor field does not name James Doohan")
if "The Ambergris Element" not in role_text:
    raise RuntimeError("Cadmar source does not identify The Ambergris Element")

pageimage = role_page.get("pageimage")
image_titles = [row.get("title") for row in role_page.get("images", []) if row.get("title")]
still_title = None
if pageimage:
    still_title = f"File:{pageimage}" if not pageimage.startswith("File:") else pageimage
if not still_title:
    still_title = next(
        (title for title in image_titles if "cadmar" in title.lower()),
        None,
    )
if not still_title:
    raise RuntimeError("No role-specific Cadmar image title found")

still_page = image_query("memory-alpha.fandom.com", still_title)
imageinfo = (still_page.get("imageinfo") or [None])[0]
if not imageinfo or not imageinfo.get("url"):
    raise RuntimeError("Cadmar image information missing")

episode_page, episode_text = revision_query(
    "memory-alpha.fandom.com", EPISODE_TITLE
)
episode_revision = episode_page["revisions"][0]
if "Cadmar" not in episode_text or "James Doohan" not in episode_text:
    raise RuntimeError("Episode source does not preserve Cadmar/Doohan custody")
episode_receipt = {
    "source": EPISODE_SOURCE,
    "title": EPISODE_TITLE,
    "pageid": episode_page["pageid"],
    "revision": episode_revision["revid"],
    "timestamp": episode_revision["timestamp"],
    "content_sha256": sha_bytes(episode_text.encode("utf-8")),
}

commons_queries = [
    '"James Doohan" filetype:bitmap',
    '"ACTOR JIM DOOHAN" NARA filetype:bitmap',
]
commons_rows: list[dict[str, Any]] = []
seen_titles: set[str] = set()
for query in commons_queries:
    payload = api("commons.wikimedia.org", {
        "action": "query",
        "format": "json",
        "formatversion": 2,
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": 6,
        "gsrlimit": 50,
        "prop": "imageinfo",
        "iiprop": "url|size|sha1|extmetadata",
    })
    for page in payload.get("query", {}).get("pages", []):
        title = page.get("title")
        info = (page.get("imageinfo") or [None])[0]
        if not title or not info or title in seen_titles:
            continue
        seen_titles.add(title)
        meta = info.get("extmetadata") or {}
        commons_rows.append({
            "title": title,
            "pageid": page.get("pageid"),
            "url": info.get("url"),
            "description_url": info.get("descriptionurl"),
            "width": info.get("width"),
            "height": info.get("height"),
            "size": info.get("size"),
            "sha1": info.get("sha1"),
            "mime": info.get("mime"),
            "artist": (meta.get("Artist") or {}).get("value"),
            "license": (meta.get("LicenseShortName") or {}).get("value"),
            "credit": (meta.get("Credit") or {}).get("value"),
            "description": (meta.get("ImageDescription") or {}).get("value"),
            "date_time_original": (meta.get("DateTimeOriginal") or {}).get("value"),
        })

specimens = json.loads(Path("data/specimens.json").read_text())
existing = []
for row in specimens:
    if row.get("actor") != PERFORMER:
        continue
    portrait = row.get("portrait") or {}
    existing.append({
        "id": row.get("id"),
        "character": row.get("character"),
        "production": row.get("production"),
        "portrait_src": portrait.get("src"),
        "portrait_origin": portrait.get("origin"),
        "portrait_author": portrait.get("author"),
        "portrait_license": portrait.get("license"),
        "portrait_sha256": (
            sha_bytes(Path(portrait["src"]).read_bytes())
            if portrait.get("src") and Path(portrait["src"]).exists()
            else None
        ),
    })

relevant_lines = [
    line.strip()
    for line in role_text.splitlines()
    if any(
        needle.lower() in line.lower()
        for needle in [
            "actor",
            "James Doohan",
            "The Ambergris Element",
            "Senior Tribune",
            "Ruling Tribunal",
            "Aquan",
            "voiced",
        ]
    )
]

source_receipt = {
    "version": 1,
    "transaction": "STAR-TREK-CADMAR-SOURCE-RECEIPT",
    "canonical_parent": EXPECTED_MAIN,
    "task_id": TASK_ID,
    **role_receipt,
    "source_fingerprint": FINGERPRINT,
    "queued_mode_hint": task["performance_modes"],
    "performance_mode": "voice-only",
    "performance_scope": (
        "James Doohan's voice performance as Cadmar in "
        "The Ambergris Element (1973)"
    ),
    "source_wording": (
        "The frozen role source names James Doohan in the actor field and "
        "states that he provided Cadmar's voice."
    ),
    "species": "Aquan",
    "occupation": "Senior Tribune of the Ruling Tribunal of the Aquans",
    "episode": "The Ambergris Element",
    "physical_performance": "not attributed to James Doohan",
    "voice_credit_is_performance_not_processing_credit": True,
    "maker_attribution": "unresolved",
    "animation_maker_attribution": "unresolved",
    "visual_character_design_attribution": "unresolved",
    "voice_direction_attribution": "unresolved",
    "editing_attribution": "unresolved",
    "sound_processing_attribution": "unresolved",
    "production_shop_attribution": "unresolved",
    "vocal_transformation_measured": False,
    "ari_bn_bem_role_not_conflated": True,
    "agmar_role_not_conflated": True,
    "aleek_om_role_not_conflated": True,
    "arex_role_not_conflated": True,
    "episode_receipts": [episode_receipt],
}
source_receipt["receipt_sha256"] = sha_bytes(
    pretty(source_receipt).encode("utf-8")
)

summary = {
    "canonical_parent": EXPECTED_MAIN,
    "task_id": TASK_ID,
    "source": SOURCE,
    "source_fingerprint": FINGERPRINT,
    **{key: role_receipt[key] for key in ["pageid", "revision", "timestamp", "content_sha256"]},
    "queued_mode_hint": task["performance_modes"],
    "actor_lines": actor_lines,
    "still_title": still_title,
    "episode_receipts": [episode_receipt],
    "existing_performer_record_count": len(existing),
    "commons_candidate_count": len(commons_rows),
    "maker_attribution": "unresolved",
    "still_source_page": f"https://memory-alpha.fandom.com/wiki/{urllib.parse.quote(still_title.replace(' ', '_'))}",
    "still_url": imageinfo.get("url"),
    "still_api_size": imageinfo.get("size"),
    "still_width": imageinfo.get("width"),
    "still_height": imageinfo.get("height"),
    "still_sha1": imageinfo.get("sha1"),
}

write("cadmar-source.wikitext", role_text)
write("episode-the-ambergris-element.wikitext", episode_text)
write("task.json", task)
write("source-receipt.json", source_receipt)
write("episode-receipts.json", [episode_receipt])
write("role-query.json", role_page)
write("still-file-query.json", still_page)
write("still-title.txt", still_title + "\n")
write("page-images.json", {
    "pageimage": pageimage,
    "images": image_titles,
    "selected": still_title,
})
write("commons-performer-images.json", commons_rows)
write("existing-performer-records.json", existing)
write("relevant-lines.json", relevant_lines)
write("summary.json", summary)

print(json.dumps(summary, indent=2, ensure_ascii=False))
