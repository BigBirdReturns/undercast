from __future__ import annotations

from pathlib import Path
import hashlib
import json
import re
import sys

if len(sys.argv) != 3:
    raise SystemExit("usage: kukulkan-cycle-controller-rebind-v1.py <controller-root> <preparation-root>")

root = Path(sys.argv[1])
prep = Path(sys.argv[2])
programs = root / "programs"
media = json.loads((prep / "media-preparation.json").read_text())
source = json.loads((prep / "source-receipt.json").read_text())

episodes = media.get("episode_receipts") or []
if len(episodes) != 1:
    raise SystemExit(f"Kukulkan exact episode receipt cardinality drifted: {episodes}")

episode_source = episodes[0]["source"]
still_origin = media["still"]["origin"]
portrait_origin = media["portrait"]["origin"]
portrait_license = media["portrait"]["license"]
portrait_year = int(str(media["portrait"]["date_scope"])[:4])
fetched_at = str(media["generated_at"])[:10]

expected = {
    "episode_source": "https://memory-alpha.fandom.com/wiki/How_Sharper_Than_a_Serpent%27s_Tooth_(episode)",
    "still_origin": "https://static.wikia.nocookie.net/memoryalpha/images/c/c2/Kukulkan.jpg/revision/latest?cb=20061124010215&path-prefix=en",
    "portrait_origin": "https://commons.wikimedia.org/wiki/File:James_Doohan_-_Walk_of_Fame_-_July_21_2005.jpg",
    "portrait_license": "CC BY-SA 3.0",
    "portrait_year": 2005,
}
actual = {
    "episode_source": episode_source,
    "still_origin": still_origin,
    "portrait_origin": portrait_origin,
    "portrait_license": portrait_license,
    "portrait_year": portrait_year,
}
if actual != expected:
    raise SystemExit(f"sealed Kukulkan media identity drifted: {actual}")
if source.get("receipt_sha256") != "8bd855653a81825dafe71625d0efd5bae08f6cffe69f72e68dce145f541c6fef":
    raise SystemExit("sealed Kukulkan source receipt identity drifted")


def replace_const(text: str, name: str, value: str) -> tuple[str, int]:
    pattern = re.compile(rf"^const {re.escape(name)} = .*?;$", re.M)
    return pattern.subn(f"const {name} = {json.dumps(value, ensure_ascii=False)};", text)


semantic_replacements = [
    ("validate canonical Kukulkan custody before projection", "validate canonical Kol-Tai custody before projection"),
    ("prior Kukulkan custody drifted", "prior Kol-Tai custody drifted"),
    ("validate Kukulkan chain", "validate Kol-Tai chain"),
    ("immutable prior Kukulkan and prior Star Trek custody", "immutable prior Kol-Tai and prior Star Trek custody"),
    ("prior Kukulkan receipt custody drifted", "prior Kol-Tai receipt custody drifted"),
    ("prior Kukulkan checker custody drifted", "prior Kol-Tai checker custody drifted"),
    ("validate immutable Kukulkan chain", "validate immutable Kol-Tai chain"),
    ("Kukulkan lost prior Kukulkan custody", "Kukulkan lost prior Kol-Tai custody"),
    ("Kukulkan checker failed under Kukulkan custody", "Kukulkan checker failed under Kol-Tai custody"),
    ("validate immutable Kukulkan cycle", "validate immutable Kol-Tai cycle"),
    ("immutable Kukulkan cycle custody", "immutable Kol-Tai predecessor custody"),
    (
        "Kukulkan, Cadmar, Cheeron, and Ari bn Bem remain separate Doohan roles",
        "Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separate James Doohan roles",
    ),
    (
        "Kukulkan, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separate James Doohan roles",
        "Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separate James Doohan roles",
    ),
    (
        "separate Kukulkan, Cadmar, Cheeron, and Ari bn Bem custody",
        "separate Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem custody",
    ),
    (
        "rather than Kukulkan, Cadmar, Cheeron, Ari bn Bem",
        "rather than Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, Ari bn Bem",
    ),
    (
        "is not Kukulkan, Cadmar, Cheeron, Ari bn Bem",
        "is not Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, Ari bn Bem",
    ),
    ("permanent route, and Kukulkan custody", "permanent route, and Kol-Tai custody"),
    (
        "remains distinct from Kukulkan, Cadmar, Cheeron, and Ari bn Bem",
        "remains distinct from Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem",
    ),
    ("a separate public-domain Doohan photograph", "a separately sourced CC BY-SA 3.0 Doohan portrait"),
    ("a separate public-domain performer photograph", "a separately sourced CC BY-SA 3.0 performer portrait"),
    ("The public-domain AllyUnion photograph", "The CC BY-SA 3.0 AllyUnion portrait"),
    ("The public-domain photograph identifies James Doohan", "The CC BY-SA 3.0 portrait identifies James Doohan"),
    ("CC BY 2.0 portrait", "CC BY-SA 3.0 portrait"),
    (
        "ari_agmar_aleek_arex_roles_are_not_conflated",
        "kol_tai_karl_four_domar_chuft_captain_cadmar_cheeron_ari_bn_bem_roles_are_not_conflated",
    ),
    ("prior_ari_bn_bem_", "prior_kol_tai_"),
]

patch_counts: dict[str, dict[str, int]] = {}
for path in sorted(programs.iterdir()):
    text = path.read_text()
    counts: dict[str, int] = {}
    if path.suffix == ".mjs":
        for name, value in (
            ("FIRST_EPISODE_SOURCE", episode_source),
            ("LAST_EPISODE_SOURCE", episode_source),
            ("STILL_SOURCE", still_origin),
            ("PORTRAIT_SOURCE", portrait_origin),
        ):
            text, count = replace_const(text, name, value)
            if count not in (0, 1):
                raise SystemExit(f"{path.name}: {name} constant cardinality drifted: {count}")
            counts[f"constant:{name}"] = count

    for old, new in semantic_replacements:
        count = text.count(old)
        if count:
            text = text.replace(old, new)
        counts[f"text:{old}"] = count

    if path.name == "unitkukulkan-controller.sh":
        count = text.count("star-trek-kukulkan-media-v1")
        if count != 2:
            raise SystemExit(f"controller media artifact-name cardinality drifted: {count}")
        text = text.replace("star-trek-kukulkan-media-v1", "star-trek-kukulkan-media-v6")
        counts["media-artifact-name"] = count

    if path.name == "unitkukulkan-stage.mjs":
        text, count = re.subn(r"year:\s*1967,", f"year: {portrait_year},", text)
        if count != 1:
            raise SystemExit(f"portrait year cardinality drifted: {count}")
        counts["portrait-year"] = count
        text, count = re.subn(
            r"fetched_at:\s*'\d{4}-\d{2}-\d{2}'",
            f"fetched_at: '{fetched_at}'",
            text,
        )
        if count != 1:
            raise SystemExit(f"source fetched-at cardinality drifted: {count}")
        counts["fetched-at"] = count

    path.write_text(text)
    patch_counts[path.name] = counts

all_text = "\n".join(path.read_text() for path in sorted(programs.iterdir()))
required = [
    episode_source,
    still_origin,
    portrait_origin,
    "prior Kol-Tai custody drifted",
    "immutable prior Kol-Tai and prior Star Trek custody",
    "immutable Kol-Tai predecessor custody",
    "Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem",
    "CC BY-SA 3.0 AllyUnion portrait",
    "prior_kol_tai_receipt_path",
    "kol_tai_karl_four_domar_chuft_captain_cadmar_cheeron_ari_bn_bem_roles_are_not_conflated",
    "star-trek-kukulkan-media-v6",
]
for needle in required:
    if needle not in all_text:
        raise SystemExit(f"corrected Kukulkan controller lost required binding: {needle}")

forbidden = [
    "prior Kukulkan custody",
    "prior Kukulkan receipt",
    "prior Kukulkan checker",
    "under Kukulkan custody",
    "immutable prior Kukulkan",
    "immutable Kukulkan cycle custody",
    "rather than Kukulkan, Cadmar",
    "is not Kukulkan, Cadmar",
    "separate Kukulkan, Cadmar",
    "Kukulkan, Domar, Chuft-Captain, Cadmar",
    "public-domain Doohan photograph",
    "public-domain performer photograph",
    "public-domain AllyUnion photograph",
    "The public-domain photograph identifies James Doohan",
    "CC BY 2.0 portrait",
    "Star_Trek_Cast_and_Crew_Visit_AllyUnion_Dryden_in_1967",
    "memoryalpha/images/a/ac/Kukulkan",
    "How Sharper Than a Serpent\\'s Tooth_(episode)",
    "year: 1967",
    "fetched_at: '2026-08-18'",
    "star-trek-kukulkan-media-v1",
]
for needle in forbidden:
    if needle in all_text:
        raise SystemExit(f"corrected Kukulkan controller retained forbidden residue: {needle}")

manifest_path = root / "controller-source-manifest.json"
manifest = json.loads(manifest_path.read_text())
for row in manifest.get("files", []):
    path = programs / row["file"]
    if not path.is_file():
        raise SystemExit(f"missing corrected controller program: {path}")
    row["bytes"] = path.stat().st_size
    row["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()

patch_receipt = {
    "version": 1,
    "transaction": "STAR-TREK-KUKULKAN-CONTROLLER-EXECUTION-REBINDING",
    "status": "applied",
    "sealed_source_receipt_sha256": source["receipt_sha256"],
    "sealed_facets_sha256": media["facets_sha256"],
    "episode_source": episode_source,
    "still_origin": still_origin,
    "portrait_origin": portrait_origin,
    "portrait_license": portrait_license,
    "portrait_year": portrait_year,
    "source_fetched_at": fetched_at,
    "patch_counts": patch_counts,
}
patch_payload = json.dumps(
    patch_receipt,
    sort_keys=True,
    separators=(",", ":"),
    ensure_ascii=False,
) + "\n"
patch_receipt["receipt_sha256"] = hashlib.sha256(patch_payload.encode()).hexdigest()
(root / "execution-controller-rebinding.json").write_text(
    json.dumps(patch_receipt, indent=2, ensure_ascii=False) + "\n"
)
manifest["execution_rebinding"] = {
    "status": "applied",
    "receipt": "execution-controller-rebinding.json",
    "receipt_sha256": patch_receipt["receipt_sha256"],
}
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
print(json.dumps(patch_receipt, indent=2, ensure_ascii=False))
