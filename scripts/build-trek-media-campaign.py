#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import unicodedata
import urllib.parse
from pathlib import Path

REVIEWED_AT = "2026-07-23T15:30:00.000Z"
EXTRA_INDICES = {138, 201, 247, 256, 262, 345, 491, 545}
EXTRA_REASONS = {
    138: "The portrait origin is the revision-bound Sven-Ole Thorsen page, not Michael John Anderson; this is a wrong-person substitution.",
    201: "The Commons file metadata identifies Niall Horan, not actor James Horan; this is a namesake substitution.",
    247: "The Commons file description identifies Bob Bauer, White House Counsel, not actor Robert Bauer; this is a namesake substitution.",
    256: "The Commons file description identifies Mexican referee Marco Antonio Rodríguez, not actor Marco Rodríguez; this is a namesake substitution.",
    262: "The Commons file description identifies theologian N. T. Wright, not American actor Tom Wright; this is a namesake substitution.",
    345: "The still is comic artwork rather than a filmed or animated depiction of the filed Jadzia Dax performance.",
    491: "The still origin is Lee Arenberg's performer page and does not bind the image to the combined Bok / Gral / Prak role identity.",
    545: "The still origin is an episode page rather than an exact file or character page; the preserved metadata does not bind these bytes specifically to Captain Dorg.",
}
MANUAL_SIGNALS = {
    172: ("ImageDescription", "Leigh McCloskey at THOTHS Library"),
    336: ("page-title", "B-4"),
    358: ("page-title", "F5"),
    359: ("page-title", "F8"),
    489: ("file-link", "John Schuck / Klingon 23rd ambassador / Star Trek VI"),
    544: ("file-link", "Oh / Tamlyn Tomita / Star Trek: Picard"),
}
ARTIFACTS = {
    "contact_sheet": {
        "workflow_run": 30017783530,
        "artifact_id": 8567894793,
        "name": "trek-media-review-export",
        "sha256": "2205bcf0dd61104404498d9c073ce9424b2ea64b84183d5cbd52c7475437a859",
    },
    "wikimedia_metadata": {
        "workflow_run": 30019760354,
        "artifact_id": 8568717239,
        "name": "trek-wikimedia-source-metadata",
        "sha256": "242326aa4229761deeb5d561dff03353da0cc41d9779a3ce8664f567e5d920d7",
    },
    "fandom_metadata": {
        "workflow_run": 30020178341,
        "artifact_id": 8568892281,
        "name": "trek-fandom-source-metadata",
        "sha256": "e8671f263d2c173d4fbfd7f97d5d7a8be49b17cc0f31e7bc793f0d35c2d56fec",
    },
}

def norm(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-zA-Z0-9']+", " ", text).strip().lower()

def compact(value):
    return re.sub(r"[^a-z0-9]+", "", norm(value))

def components(value):
    return [part.strip() for part in re.split(r"\s*(?:/|&|;)\s*", value) if part.strip()]

def metadata_values(meta):
    rows = [("title", meta.get("title", ""))]
    ext = meta.get("extmetadata") or {}
    for key in ["ImageDescription", "ObjectName", "Categories", "Credit", "Artist", "Attribution", "ShortDescription"]:
        if ext.get(key):
            rows.append((key, ext[key]))
    for key in ["categories", "links", "globalusage"]:
        rows.extend((key, value) for value in (meta.get(key) or []))
    return [(key, str(value)) for key, value in rows if value]

def source_signal(row, meta):
    if row["index"] in MANUAL_SIGNALS:
        kind, value = MANUAL_SIGNALS[row["index"]]
        return {"kind": kind, "value": value}
    candidates = metadata_values(meta)
    if row["side"] == "portrait":
        expected = compact(row["expected_subject"])
        matches = [
            (key, value) for key, value in candidates
            if expected and (expected in compact(value) or compact(value) in expected)
            and min(len(expected), len(compact(value))) >= 5
        ]
        priority = {"ImageDescription": 0, "ObjectName": 1, "categories": 2, "globalusage": 3, "title": 4, "links": 5}
        matches.sort(key=lambda pair: priority.get(pair[0], 99))
        if not matches:
            raise SystemExit(f'no performer source signal for #{row["index"]} {row["expected_subject"]}')
        kind, value = matches[0]
        return {"kind": kind, "value": value}
    variants = []
    for component in components(row["expected_subject"]):
        variants += [
            component,
            re.sub(r"^(?:the|dr\.?|doctor|commander|captain|admiral|ambassador|general|colonel|major|lieutenant|senator|vedek|kai|gul|glinn|legate|maje|daimon|commodore|administrator|nurse|mr\.?)\s+", "", component, flags=re.I),
            re.sub(r"\s*\([^)]*\)\s*", " ", component),
        ]
    matches = []
    for kind, value in candidates:
        packed = compact(value)
        for variant in variants:
            expected = compact(variant)
            if expected and len(expected) >= 3 and (expected in packed or packed in expected) and min(len(expected), len(packed)) >= 3:
                matches.append((variant, kind, value))
                break
    priority = {"title": 0, "links": 1, "ImageDescription": 2, "categories": 3, "globalusage": 4}
    matches.sort(key=lambda triple: priority.get(triple[1], 99))
    if not matches:
        raise SystemExit(f'no character source signal for #{row["index"]} {row["expected_subject"]}')
    component, kind, value = matches[0]
    return {"kind": kind, "value": value, "matched_component": component}

def load_single(root, filename):
    matches = list(Path(root).rglob(filename))
    if len(matches) != 1:
        raise SystemExit(f"expected one {filename} beneath {root}, found {len(matches)}")
    return json.loads(matches[0].read_text())

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", required=True)
    parser.add_argument("--wikimedia", required=True)
    parser.add_argument("--fandom", required=True)
    parser.add_argument("--out", default="data/review")
    args = parser.parse_args()

    manifest = load_single(args.review, "manifest.json")
    sheets = load_single(args.review, "sheets.json")
    wmeta = load_single(args.wikimedia, "metadata.json")
    fmeta = load_single(args.fandom, "metadata.json")
    if len(manifest["items"]) != 648:
        raise SystemExit(f'unexpected review count {len(manifest["items"])}')
    if manifest["source_item_set_sha256"] != wmeta["item_set_sha256"] or manifest["source_item_set_sha256"] != fmeta["item_set_sha256"]:
        raise SystemExit("review artifacts target different media item sets")

    wm = {row["item_id"]: row for row in wmeta["rows"]}
    fm = {row["item_id"]: row for row in fmeta["rows"]}
    sheet_by_index = {item["index"]: sheet["sheet"] for sheet in sheets for item in sheet["items"]}
    by_index = {row["index"]: row for row in manifest["items"]}
    remediation_ids = {row["item_id"] for row in manifest["items"] if row["status"] == "attention"} | {by_index[index]["item_id"] for index in EXTRA_INDICES}

    def metadata_for(row):
        host = urllib.parse.urlparse(row["asset_origin"]).hostname or ""
        return (fm if host.endswith("fandom.com") else wm)[row["item_id"]]["origin_metadata"]

    receipt_rows, remediations, approvals = [], [], []
    for row in manifest["items"]:
        meta = metadata_for(row)
        host = urllib.parse.urlparse(row["asset_origin"]).hostname or ""
        expected_article = wm.get(row["item_id"], {}).get("expected_article")
        base = {
            "index": row["index"], "item_id": row["item_id"], "wall_id": row["wall_id"], "side": row["side"],
            "expected_subject": row["expected_subject"], "asset_sha256": row["asset_sha256"], "asset_origin": row["asset_origin"],
            "contact_sheet": sheet_by_index[row["index"]],
            "origin_receipt": {"host": host, **{key: meta.get(key) for key in ["title", "pageid", "revision", "timestamp", "sha1", "metadata_sha256"]}},
        }
        if expected_article:
            base["expected_article"] = expected_article
        source_revision = {"type": "source-revision", "value": f'{host}:{meta.get("pageid")}@{meta.get("revision")}:{meta.get("sha1")}' }
        sheet_evidence = {"type": "contact-sheet", "value": f'{ARTIFACTS["contact_sheet"]["sha256"]}:{sheet_by_index[row["index"]]}#{row["index"]}'}
        if row["item_id"] in remediation_ids:
            if row["status"] == "attention":
                vote = (row.get("votes") or [{}])[0]
                reason = vote.get("note") or "Existing authorized presentation ruling requires removal from the canonical media slot."
                basis = {"kind": "existing-enforced-presentation-ruling", "value": (row.get("claims") or {}).get("presentation", {}).get("value")}
            else:
                reason = EXTRA_REASONS[row["index"]]
                basis = {"kind": "source-and-presentation-review", "value": reason}
            receipt_rows.append({**base, "disposition": "null", "basis": basis})
            remediations.append({"item_id": row["item_id"], "asset_sha256": row["asset_sha256"], "reason": reason, "evidence": [source_revision, sheet_evidence]})
        else:
            signal = source_signal(row, meta)
            presentation = "neutral-human" if row["side"] == "portrait" else "character-depiction"
            identity_evidence = [source_revision, {"type": "source-metadata", "value": f'{meta.get("metadata_sha256")}:{signal["kind"]}:{signal["value"]}'}]
            if expected_article:
                identity_evidence.append({"type": "expected-article", "value": f'en.wikipedia.org:{expected_article.get("pageid")}@{expected_article.get("revision")}:{expected_article.get("wikibase_item") or ""}'})
            identity_note = f'Revision-bound source metadata ({signal["kind"]}: {signal["value"]}) identifies these exact asset bytes with the expected {"performer" if row["side"] == "portrait" else "character role"} {row["expected_subject"]}; identity was not inferred from appearance.'
            presentation_note = ("Contact-sheet review shows a single neutral out-of-character human portrait without role makeup, group ambiguity, or a non-person subject." if row["side"] == "portrait" else "Contact-sheet review shows a filmed or animated depiction of the filed performance, not a landscape, diagram, prop-only image, behind-the-scenes substitute, or unrelated artwork.")
            receipt_rows.append({**base, "disposition": "verify", "identity_signal": signal, "presentation": presentation})
            approvals.append({"item_id": row["item_id"], "asset_sha256": row["asset_sha256"], "identity_note": identity_note, "identity_evidence": identity_evidence, "presentation": presentation, "presentation_note": presentation_note, "presentation_evidence": [sheet_evidence]})

    if (len(receipt_rows), len(approvals), len(remediations)) != (648, 556, 92):
        raise SystemExit(f"unexpected campaign counts: {len(receipt_rows)}/{len(approvals)}/{len(remediations)}")

    receipt = {
        "version": 1,
        "scope": "star-trek",
        "reviewed_at": REVIEWED_AT,
        "semantics": "Identity decisions rely on revision-bound source metadata and canonical provenance, never facial recognition. Presentation decisions rely on a hash-bound contact-sheet review of the exact repository bytes.",
        "source": {"item_set_sha256": manifest["source_item_set_sha256"], "specimens_sha256": manifest["source_specimens_sha256"], "sources_sha256": manifest["source_sources_sha256"], "media_manifest_sha256": manifest["source_media_manifest_sha256"]},
        "artifacts": ARTIFACTS,
        "counts": {"total": 648, "verify": 556, "null": 92},
        "rows": receipt_rows,
    }
    receipt_bytes = (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode()
    receipt_sha = hashlib.sha256(receipt_bytes).hexdigest()
    campaign = {
        "version": 2,
        "scope": "star-trek",
        "reviewed_by": "chatgpt-second-desk",
        "reviewed_role": "second-desk",
        "reviewed_at": REVIEWED_AT,
        "source": receipt["source"],
        "source_receipt": {"path": "data/review/star-trek-media-source-receipts-2026-07-23.json", "sha256": receipt_sha},
        "expected_result": {"total": 744, "verified": 556, "absent": 188, "review": 0, "attention": 0},
        "machine_reviewer": "source-metadata-bot",
        "remediations": remediations,
        "approvals": approvals,
    }
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "star-trek-media-source-receipts-2026-07-23.json").write_bytes(receipt_bytes)
    (out / "star-trek-media-audit-campaign-2026-07-23.json").write_text(json.dumps(campaign, ensure_ascii=False, indent=2) + "\n")
    print(f"campaign: {len(approvals)} verified / {len(remediations)} nulled; receipt {receipt_sha}")

if __name__ == "__main__":
    main()
