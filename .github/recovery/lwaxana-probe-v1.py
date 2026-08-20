from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from PIL import Image
import hashlib
import html
import json
import os
import re
import shutil

REPO = Path(os.environ.get("REPO_ROOT", "."))
OUT = Path(os.environ.get("OUTPUT_ROOT", "/tmp/lwaxana-probe-v1"))
EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
EXPECTED_TASK = os.environ["TASK_ID"]
EXPECTED_FINGERPRINT = os.environ["TASK_FINGERPRINT"]
EXPECTED_CHARACTER = "Lwaxana Troi"
EXPECTED_PERFORMER = "Majel Barrett"
USER_AGENT = "UNDERCAST-Lwaxana-Probe/1.0 (preservation and attribution audit)"
MEMORY_API = "https://memory-alpha.fandom.com/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"


def fail(message: str) -> None:
    raise SystemExit(message)


def h_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def h_file(path: Path) -> str:
    return h_bytes(path.read_bytes())


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def canonical_sha(value: dict) -> str:
    payload = json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"
    return h_bytes(payload.encode())


def write_json(name: str, value) -> Path:
    path = OUT / name
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    return path


def request_bytes(url: str, referer: str | None = None) -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    request = Request(url, headers=headers)
    with urlopen(request, timeout=90) as response:
        return response.read()


def api_json(base: str, params: dict) -> dict:
    return json.loads(request_bytes(base + "?" + urlencode(params)))


def clean_html(value: str | None) -> str:
    if not value:
        return ""
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


def revision_payload(data: dict) -> tuple[dict, dict, str]:
    pages = data["query"]["pages"]
    if len(pages) != 1 or pages[0].get("missing"):
        fail(f"frozen source page drifted: {pages}")
    page = pages[0]
    revisions = page.get("revisions") or []
    if len(revisions) != 1:
        fail(f"frozen source revision cardinality drifted: {revisions}")
    revision = revisions[0]
    return page, revision, revision["slots"]["main"]["content"]


def image_payload(data: dict) -> tuple[dict, dict]:
    pages = data["query"]["pages"]
    if len(pages) != 1 or pages[0].get("missing"):
        fail(f"image page drifted: {pages}")
    page = pages[0]
    info = page.get("imageinfo") or []
    if len(info) != 1:
        fail(f"imageinfo cardinality drifted: {info}")
    return page, info[0]


def decode_image(data: bytes) -> tuple[Image.Image, tuple[int, int], str]:
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.convert("RGB"), image.size, image.format or "unknown"


def normalized_still(data: bytes) -> tuple[bytes, tuple[int, int], str]:
    image, original_size, original_format = decode_image(data)
    image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    image.save(buffer, format="WEBP", quality=94, method=6)
    return buffer.getvalue(), original_size, original_format


def normalized_portrait(data: bytes) -> tuple[bytes, tuple[int, int], str]:
    image, original_size, original_format = decode_image(data)
    image.thumbnail((1200, 1500), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=94, optimize=True, progressive=False)
    return buffer.getvalue(), original_size, original_format


def existing_image_hashes() -> dict[str, list[str]]:
    rows: dict[str, list[str]] = {}
    for path in (REPO / "images").glob("*"):
        if path.is_file():
            rows.setdefault(h_file(path), []).append(path.name)
    return rows


def max_wall_id() -> str:
    values: list[int] = []
    specimens = json.loads((REPO / "data/specimens.json").read_text())

    def walk(value):
        if isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, str):
            match = re.fullmatch(r"UC-(\d+)", value)
            if match:
                values.append(int(match.group(1)))

    walk(specimens)
    if not values:
        fail("wall id census is empty")
    return f"UC-{max(values) + 1}"


def find_role_image() -> dict:
    page_data = api_json(
        MEMORY_API,
        {
            "action": "query",
            "prop": "pageimages",
            "titles": EXPECTED_CHARACTER,
            "piprop": "original|thumbnail|name",
            "pithumbsize": "1600",
            "format": "json",
            "formatversion": "2",
        },
    )
    pages = page_data["query"]["pages"]
    if len(pages) != 1 or pages[0].get("missing"):
        fail(f"Lwaxana pageimage page drifted: {pages}")
    role_page = pages[0]
    image_title = role_page.get("pageimage")
    if not image_title:
        images_data = api_json(
            MEMORY_API,
            {
                "action": "query",
                "prop": "images",
                "titles": EXPECTED_CHARACTER,
                "imlimit": "max",
                "format": "json",
                "formatversion": "2",
            },
        )
        candidates = [
            row["title"]
            for row in (images_data["query"]["pages"][0].get("images") or [])
            if "lwaxana" in row["title"].lower()
        ]
        if not candidates:
            fail("no exact Lwaxana role image candidate found")
        image_title = candidates[0].removeprefix("File:")
    if "lwaxana" not in image_title.lower():
        fail(f"pageimage is not role-specific: {image_title}")

    image_data = api_json(
        MEMORY_API,
        {
            "action": "query",
            "prop": "imageinfo",
            "titles": "File:" + image_title,
            "iiprop": "url|size|sha1|mime|timestamp|extmetadata",
            "iiurlwidth": "1600",
            "format": "json",
            "formatversion": "2",
        },
    )
    image_page, image_info = image_payload(image_data)
    urls = [image_info.get("thumburl"), image_info.get("url")]
    original = None
    selected_url = None
    errors = []
    for url in urls:
        if not url:
            continue
        try:
            candidate = request_bytes(url, "https://memory-alpha.fandom.com/")
            decode_image(candidate)
            original = candidate
            selected_url = url
            break
        except Exception as exc:
            errors.append(f"{url}: {type(exc).__name__}: {exc}")
    if original is None:
        fail(f"Lwaxana role image download failed: {errors}")
    normalized, source_size, source_format = normalized_still(original)
    if min(source_size) < 300:
        fail(f"Lwaxana role image is undersized: {source_size}")
    return {
        "page_data": page_data,
        "image_data": image_data,
        "title": image_page["title"],
        "description_url": image_info.get("descriptionurl")
        or "https://memory-alpha.fandom.com/wiki/" + image_page["title"].replace(" ", "_"),
        "download_url": selected_url,
        "original": original,
        "normalized": normalized,
        "source_size": source_size,
        "source_format": source_format,
        "mime": image_info.get("mime"),
        "timestamp": image_info.get("timestamp"),
    }


def find_portrait(existing_hashes: dict[str, list[str]], canonical_text: str) -> dict:
    search_data = api_json(
        COMMONS_API,
        {
            "action": "query",
            "list": "search",
            "srnamespace": "6",
            "srsearch": "Majel Barrett",
            "srlimit": "100",
            "format": "json",
            "formatversion": "2",
        },
    )
    titles = [row["title"] for row in search_data["query"]["search"]]
    errors = []
    for title in titles:
        if "majel" not in title.lower() and "barrett" not in title.lower():
            continue
        try:
            data = api_json(
                COMMONS_API,
                {
                    "action": "query",
                    "prop": "imageinfo",
                    "titles": title,
                    "iiprop": "url|size|sha1|mime|timestamp|extmetadata",
                    "iiurlwidth": "1200",
                    "format": "json",
                    "formatversion": "2",
                },
            )
            page, info = image_payload(data)
            ext = info.get("extmetadata") or {}
            artist = clean_html((ext.get("Artist") or {}).get("value"))
            license_short = clean_html((ext.get("LicenseShortName") or {}).get("value"))
            description = clean_html(
                (ext.get("ImageDescription") or ext.get("ObjectName") or {}).get("value")
            )
            identity = " ".join((page.get("title", ""), description)).lower()
            if "majel barrett" not in identity and not (
                "majel" in identity and "barrett" in identity
            ):
                continue
            license_lower = license_short.lower()
            if not (
                "public domain" in license_lower
                or "cc by" in license_lower
                or "cc0" in license_lower
            ):
                continue
            origin = info.get("descriptionurl") or (
                "https://commons.wikimedia.org/wiki/" + page["title"].replace(" ", "_")
            )
            if any(
                needle and needle in canonical_text
                for needle in (origin, page["title"], page["title"].replace(" ", "_"))
            ):
                continue
            original = None
            selected_url = None
            for url in (info.get("thumburl"), info.get("url")):
                if not url:
                    continue
                try:
                    candidate = request_bytes(url, "https://commons.wikimedia.org/")
                    decode_image(candidate)
                    original = candidate
                    selected_url = url
                    break
                except Exception as exc:
                    errors.append({"title": title, "url": url, "error": f"{type(exc).__name__}: {exc}"})
            if original is None:
                continue
            normalized, source_size, source_format = normalized_portrait(original)
            if min(source_size) < 300:
                continue
            normalized_hash = h_bytes(normalized)
            collisions = existing_hashes.get(normalized_hash, [])
            if collisions:
                errors.append({"title": title, "error": f"canonical byte collision: {collisions}"})
                continue
            return {
                "search_data": search_data,
                "image_data": data,
                "title": page["title"],
                "description_url": origin,
                "download_url": selected_url,
                "original": original,
                "normalized": normalized,
                "source_size": source_size,
                "source_format": source_format,
                "mime": info.get("mime"),
                "timestamp": info.get("timestamp"),
                "author": artist,
                "license": license_short,
                "description": description,
                "selection_errors": errors,
            }
        except Exception as exc:
            errors.append({"title": title, "error": f"{type(exc).__name__}: {exc}"})
    fail(f"no source-distinct Majel Barrett portrait candidate: {errors}")


def template_inventory() -> dict:
    rows = []
    review_root = REPO / "data/review/adapter-sdk"
    for path in review_root.glob("star-trek-*-cycle.json"):
        try:
            cycle = json.loads(path.read_text())
        except Exception:
            continue
        task = cycle.get("task") or {}
        queued_mode = task.get("performance_mode") or task.get("performance_modes")
        if isinstance(queued_mode, list):
            modes = queued_mode
        elif queued_mode:
            modes = [queued_mode]
        else:
            modes = []
        canonical = cycle.get("canonical") or {}
        record = canonical.get("record") or {}
        if not any("physical" in str(mode) or "prosthetic" in str(mode) for mode in modes):
            continue
        wall_id = canonical.get("wall_id") or record.get("id") or ""
        match = re.fullmatch(r"UC-(\d+)", wall_id)
        rows.append(
            {
                "receipt_path": str(path.relative_to(REPO)),
                "checker_path": f"scripts/{path.stem}.mjs",
                "wall_id": wall_id,
                "wall_number": int(match.group(1)) if match else -1,
                "role": task.get("role") or task.get("character") or record.get("character"),
                "performer": task.get("performer") or record.get("performer"),
                "performance_mode": queued_mode,
                "canonical_parent": cycle.get("canonical_parent"),
                "receipt_identity": cycle.get("receipt_sha256"),
                "published": canonical.get("published"),
            }
        )
    rows.sort(key=lambda row: row["wall_number"], reverse=True)
    recovery = [
        str(path.relative_to(REPO))
        for path in (REPO / ".github/recovery").glob("*")
        if re.search(r"physical|prosthe|makeup|live-action", path.name, re.I)
    ]
    return {"matching_cycles": rows[:40], "matching_recovery_programs": sorted(recovery)}


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    autopilot = json.loads((REPO / "data/AUTOPILOT.json").read_text())
    jobs = [row for row in autopilot["jobs"] if row.get("id") == EXPECTED_TASK]
    if len(jobs) != 1:
        fail(f"Lwaxana task cardinality drifted: {len(jobs)}")
    task = jobs[0]
    expected = {
        "status": "queued",
        "scope": "star-trek",
        "character": EXPECTED_CHARACTER,
        "performer": EXPECTED_PERFORMER,
        "priority": 1340,
        "source_fingerprint": EXPECTED_FINGERPRINT,
    }
    for key, value in expected.items():
        if task.get(key) != value:
            fail(f"Lwaxana task {key} drifted: {task.get(key)!r}")
    if task.get("performance_modes") != ["physical-prosthetic"]:
        fail(f"Lwaxana queued mode drifted: {task.get('performance_modes')}")
    if task.get("sources") != ["https://memory-alpha.fandom.com/wiki/Lwaxana_Troi"]:
        fail(f"Lwaxana source drifted: {task.get('sources')}")
    wall_id = max_wall_id()
    if wall_id != "UC-1391":
        fail(f"Lwaxana wall id drifted: {wall_id}")
    write_json("task.json", task)

    receipts = task.get("source_receipts") or []
    if len(receipts) != 1:
        fail(f"Lwaxana source receipt cardinality drifted: {receipts}")
    queued_receipt = receipts[0]
    revision = int(queued_receipt["revision"])
    expected_content_sha = queued_receipt["content_sha256"]
    source_data = api_json(
        MEMORY_API,
        {
            "action": "query",
            "prop": "revisions",
            "revids": str(revision),
            "rvprop": "ids|timestamp|content",
            "rvslots": "main",
            "format": "json",
            "formatversion": "2",
        },
    )
    source_page, source_revision, source_text = revision_payload(source_data)
    source_bytes = source_text.encode()
    if h_bytes(source_bytes) != expected_content_sha:
        fail(f"Lwaxana frozen content hash drifted: {h_bytes(source_bytes)}")
    if source_revision["revid"] != revision:
        fail("Lwaxana frozen revision identity drifted")
    (OUT / "lwaxana-source.wikitext").write_bytes(source_bytes)
    write_json("lwaxana-source-api.json", source_data)

    lines = source_text.splitlines()
    actor_lines = [
        line
        for line in lines
        if "Majel Barrett" in line
        and re.search(r"actor|actress|portray|played|perform", line, re.I)
    ]
    if not actor_lines:
        fail("frozen Lwaxana source lost Majel Barrett performance binding")
    prosthetic_lines = [
        line
        for line in lines
        if re.search(r"prosthe|make.?up|wig|costume|wardrobe|hair", line, re.I)
    ]
    maker_lines = [
        line
        for line in prosthetic_lines
        if re.search(r"\[\[[A-Z][^\]]+\]\]", line)
        and re.search(r"designed|created|applied|make.?up|costume|hair|wig", line, re.I)
    ]
    source_receipt = {
        "version": 1,
        "transaction": "STAR-TREK-LWAXANA-SOURCE-RECEIPT-V1",
        "canonical_parent": EXPECTED_MAIN,
        "task_id": EXPECTED_TASK,
        "source_fingerprint": EXPECTED_FINGERPRINT,
        "source": task["sources"][0],
        "pageid": source_page["pageid"],
        "revision": source_revision["revid"],
        "timestamp": source_revision["timestamp"],
        "content_sha256": h_bytes(source_bytes),
        "queued_mode_hint": task["performance_modes"],
        "performance_mode": "physical / live-action",
        "performance_scope": "Majel Barrett's physical live-action performance as Lwaxana Troi",
        "performance_binding_lines": actor_lines,
        "prosthetic_component": (
            "source carries presentation evidence requiring bounded adjudication"
            if prosthetic_lines
            else "unresolved from frozen role source"
        ),
        "prosthetic_evidence_lines": prosthetic_lines,
        "maker_attribution": "unresolved",
        "maker_candidate_lines": maker_lines,
        "no_voice_only_inference": True,
        "no_prosthetic_labor_credit_inferred": True,
        "no_makeup_or_costume_credit_inferred": True,
    }
    source_receipt["receipt_sha256"] = canonical_sha(dict(source_receipt))
    write_json("source-receipt.json", source_receipt)
    write_json(
        "relevant-lines.json",
        {
            "performance": actor_lines,
            "prosthetic_or_presentation": prosthetic_lines,
            "maker_candidates": maker_lines,
        },
    )

    existing_hashes = existing_image_hashes()
    canonical_text = "\n".join(
        path.read_text(errors="replace")
        for path in (REPO / "CREDITS.md", REPO / "data/specimens.json", REPO / "data/SOURCES.json")
        if path.exists()
    )
    still = find_role_image()
    still_hash = h_bytes(still["normalized"])
    if still_hash in existing_hashes:
        fail(f"Lwaxana normalized still collides with canonical media: {existing_hashes[still_hash]}")
    portrait = find_portrait(existing_hashes, canonical_text)
    portrait_hash = h_bytes(portrait["normalized"])
    if portrait_hash in existing_hashes:
        fail(f"Majel Barrett normalized portrait collides with canonical media: {existing_hashes[portrait_hash]}")
    if still_hash == portrait_hash:
        fail("Lwaxana character and performer facets collide")
    if still["description_url"] == portrait["description_url"]:
        fail("Lwaxana character and performer origins collide")

    still_path = OUT / "uc-1391-still.webp"
    portrait_path = OUT / "uc-1391-portrait.jpg"
    still_path.write_bytes(still["normalized"])
    portrait_path.write_bytes(portrait["normalized"])
    (OUT / "lwaxana-still-original").write_bytes(still["original"])
    (OUT / "majel-barrett-portrait-original").write_bytes(portrait["original"])
    write_json("lwaxana-still-page-api.json", still["page_data"])
    write_json("lwaxana-still-image-api.json", still["image_data"])
    write_json("majel-barrett-search-api.json", portrait["search_data"])
    write_json("majel-barrett-image-api.json", portrait["image_data"])

    facets = [
        {
            "side": "still",
            "subject": EXPECTED_CHARACTER,
            "src": "images/uc-1391-still.webp",
            "origin": still["description_url"],
            "source_page": task["sources"][0],
            "sha256": still_hash,
            "bytes": len(still["normalized"]),
        },
        {
            "side": "portrait",
            "subject": EXPECTED_PERFORMER,
            "src": "images/uc-1391-portrait.jpg",
            "origin": portrait["description_url"],
            "author": portrait["author"],
            "license": portrait["license"],
            "sha256": portrait_hash,
            "bytes": len(portrait["normalized"]),
        },
    ]
    facets_sha = canonical_sha({"facets": facets})
    media = {
        "version": 1,
        "transaction": "STAR-TREK-LWAXANA-MEDIA-PREPARATION-V1",
        "generated_at": generated_at,
        "canonical_parent": EXPECTED_MAIN,
        "task_id": EXPECTED_TASK,
        "source_fingerprint": EXPECTED_FINGERPRINT,
        "wall_id": wall_id,
        "source_receipt_sha256": source_receipt["receipt_sha256"],
        "maker_attribution": "unresolved",
        "still": {
            **facets[0],
            "image_title": still["title"],
            "download_url": still["download_url"],
            "source_size": list(still["source_size"]),
            "source_format": still["source_format"],
        },
        "portrait": {
            **facets[1],
            "image_title": portrait["title"],
            "download_url": portrait["download_url"],
            "source_size": list(portrait["source_size"]),
            "source_format": portrait["source_format"],
            "description": portrait["description"],
        },
        "facets": facets,
        "facets_sha256": facets_sha,
        "byte_collision": False,
        "source_collision": False,
        "cross_facet_substitution": False,
        "media_review": {
            "verdict": "pass",
            "role_image_is_character_evidence_only": True,
            "portrait_is_performer_evidence_only": True,
            "source_distinct": True,
            "byte_distinct": True,
        },
    }
    write_json("media-preparation.json", media)
    inventory = template_inventory()
    write_json("template-inventory.json", inventory)

    probe = {
        "version": 1,
        "transaction": "STAR-TREK-LWAXANA-PROBE-V1",
        "status": "success",
        "generated_at": generated_at,
        "canonical_parent": EXPECTED_MAIN,
        "task_id": EXPECTED_TASK,
        "source_fingerprint": EXPECTED_FINGERPRINT,
        "character": EXPECTED_CHARACTER,
        "performer": EXPECTED_PERFORMER,
        "wall_id": wall_id,
        "source_receipt_sha256": source_receipt["receipt_sha256"],
        "facets_sha256": facets_sha,
        "adjudicated_performance_mode": source_receipt["performance_mode"],
        "prosthetic_component": source_receipt["prosthetic_component"],
        "maker_attribution": "unresolved",
        "template_candidates": len(inventory["matching_cycles"]),
        "canonical_mutation": False,
        "lease_taken": False,
    }
    probe["receipt_sha256"] = canonical_sha(dict(probe))
    write_json("probe.json", probe)

    manifest = []
    for path in sorted(OUT.iterdir()):
        if path.name == "manifest.sha256":
            continue
        manifest.append(f"{h_file(path)}  {path.name}")
    (OUT / "manifest.sha256").write_text("\n".join(manifest) + "\n")
    print(json.dumps(probe, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
