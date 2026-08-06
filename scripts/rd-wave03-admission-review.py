#!/usr/bin/env python3
"""Deterministic offline admission review for RD-W03 exact-capture objects."""
from __future__ import annotations

import argparse
import copy
import hashlib
import html
from html.parser import HTMLParser
import json
import pathlib
import re
import sys
from typing import Any

SCHEMA_VERSION = 1
REVIEW_ID = "RD-W03-ADMISSION-REVIEW-01"
ISSUE = 413
PARENT = {
    "pull_request": 409,
    "parent": "45fc33aa8de8c01f03f006c5c01765dd1929385f",
    "head": "b996deefe04f73580bd5480bd4c388e6f313f02a",
    "tree": "2470615305e397d724ee7876124e63b1d123c13b",
}
CAPTURE = {
    "supervisor_run_id": 31021882771,
    "supervisor_artifact_id": 8937114139,
    "supervisor_artifact_sha256": "862f20b9b168fa70cd7ba3d57f1e84bf43f0738a68155d7b60a571e6720e50a5",
    "verification_run_id": 31029020122,
    "verification_head": "7e9ace84816a137d0e1df952cdafccd95ac4b1ce",
    "verification_artifact_id": 8940053176,
    "verification_artifact_digest": "sha256:b0fb0b27259349775b0d48b4eeab3024a5831139c05ebe58a3955aaf50d3e079",
    "capture_receipt_sha256": "a321eb48c1cd2fd3d25038be99be3efca0b8cf63317f70a3b4771a51bd37fee1",
}
INTAKE = {
    "RD-01": {
        "run_id": 30984441377,
        "artifact_id": 8921486625,
        "artifact_digest": "sha256:71cae00e0122445642342e0a8a1a12e45a828a47a0e6941f3eea90e38e35607d",
        "head": "7f00c571c96f393a8cf15f052c151992edb1a961",
        "plan_sha256": "3a041787a3e4f12d1e977753b4affa48ae30e2dd1643f274bbb9f58c23986dbd",
        "receipt_sha256": "2b72b84a845484151bc27e8c46ead57b39ee85f53cd78a1a27d701b43d929171",
        "protocol_blob": "00ede8f34a9eb976b18b4f7d019e1fb721b4f79e",
        "field_matrix_blob": "363fd1f549430851c1e5dc29c9ff1aee809b8fe1",
    },
    "RD-02": {
        "run_id": 30984459798,
        "artifact_id": 8921491294,
        "artifact_digest": "sha256:9530dd7688458b9bde67045f5496d3876160c0b4ec8de11b9cc688e04dd3c829",
        "head": "55a69c566270b01e35587123daff42808f48e3dd",
        "plan_sha256": "0cc9707d25aabf46871a7cb73f8965c978dcef7c76640323412d05a7c23dda77",
        "receipt_sha256": "cc90f314fdae7d99791425454794d283a20d35211374f9bcc371f4272b51f237",
        "protocol_blob": "ddfb1e466a17587de9059094fad0725dd587f9cf",
        "field_matrix_blob": None,
    },
    "RD-04": {
        "run_id": 30984497436,
        "artifact_id": 8921512275,
        "artifact_digest": "sha256:d4d5653c72dca66b56e0688106c41111a35ef7335a7910f33a378fb97584fd66",
        "head": "4b4f3d44c4926c6961e1e7f1ebe982acee6c2c9c",
        "plan_sha256": "e42eb9c1d62e63d200e92e69964a5d8699caddd2348eb7210063421a3e704499",
        "receipt_sha256": "c43933b2ec62debe9fc4d876b83515ea2c0d733040c7b9230dc1e142a9035e19",
        "protocol_blob": "8efcc42bd58aef3cf94205039d83be0feee14b23",
        "field_matrix_blob": None,
    },
    "RD-05": {
        "run_id": 30984516496,
        "artifact_id": 8921517083,
        "artifact_digest": "sha256:2e8dc781631ae8c86d6ebd732780b949e200d33ba9d1da1f01e99214bcc3beea",
        "head": "b472a5bdcc737e0a6b1b55f6087fb4e0f10aaed6",
        "plan_sha256": "59831a8652726a42df45ad2044686ac829752c1b16785b807c2c90233b397a1a",
        "receipt_sha256": "3bd959f0bd19b3c8eb6afb52642026725406b4d90b02d36e9155ec7f84267210",
        "protocol_blob": "a3b5e7a5b3708164065dec9492481ab531b00a5d",
        "field_matrix_blob": "326c15360240a460c3cd15ea337b58aaf096316d",
    },
}
REQUIRED_BINDINGS = ["official_object", "unit_identity", "event_class", "chronology", "bytes"]
PERMANENT_PATHS = [
    "data/research/residual-denominator/wave-03/admission-review/protocol.json",
    "data/research/residual-denominator/wave-03/admission-review/manifest.json",
    "schema/rd-wave03-admission-review.schema.json",
    "scripts/rd-wave03-admission-review.py",
    "test/rd-wave03-admission-review-adversarial.py",
    "docs/research/residual-denominator/wave-03/RD-ADMISSION-REVIEW.md",
]
SKIP_TAGS = {"script", "style", "noscript", "template", "svg", "canvas"}
DATE_PATTERNS = [
    re.compile(r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b", re.I),
    re.compile(r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b", re.I),
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
]

# The review law forbids ordinal inference. Opaque IDs are not mapped to a displayed
# entity merely because a body happens to present an ordered list.
SPECS: list[dict[str, Any]] = [
    {
        "id": "RD-W03-XCAP-01-01", "lane": "RD-01", "unit": "EDITION-01", "event": "selected_entities",
        "cell": "RD-01:EDITION-01:selected_entities", "route": "RD01-OFF-001", "body": "rd01-off-001.html",
        "title": "NatSec100 Report | Silicon Valley Defense Group",
        "mapping": "absent_opaque_edition_map", "semantic_unit": None,
        "ranges": [[1, 10], [56, 62]],
        "negative": ["EDITION-01", "ranking date"],
        "positive": ["2026 NatSec100", "top 100", "December 31, 2025"],
        "reasons": ["opaque_unit_id_unmapped", "edition_ordinal_inference_forbidden", "eligibility_cutoff_is_not_ranking_chronology"],
    },
    {
        "id": "RD-W03-XCAP-01-02", "lane": "RD-02", "unit": "MOONSHOTS-CAPITAL-FUND-3-SBIC-LP", "event": "leverage_commitment",
        "cell": "RD-02:MOONSHOTS-CAPITAL-FUND-3-SBIC-LP:leverage_commitment", "route": "RD02-OFF-004", "body": "rd02-off-004.html",
        "title": "Investment capital - Small Business Administration",
        "mapping": "explicit_unit_name", "semantic_unit": "Moonshots Capital Fund 3 SBIC LP",
        "ranges": [[4, 13], [20, 32]],
        "negative": ["MOONSHOTS", "Moonshots Capital", "Fund 3", "leverage commitment", "commitment"],
        "positive": ["Investment capital", "SBICs invest in small businesses"],
        "reasons": ["target_unit_absent", "generic_program_page", "claimed_event_absent", "event_chronology_absent"],
    },
    {
        "id": "RD-W03-XCAP-01-03", "lane": "RD-04", "unit": "AL", "event": "hearing",
        "cell": "RD-04:AL:hearing", "route": "RD04-OFF-004", "body": "rd04-off-004.html",
        "title": "CDSS Programs", "mapping": "explicit_state_code", "semantic_unit": "Alabama",
        "ranges": [[19, 25], [51, 59]],
        "negative": ["Alabama", "appeals", "hearing"],
        "positive": ["California", "California Department of Social Services", "CDSS Programs"],
        "reasons": ["jurisdiction_conflict", "target_unit_absent", "claimed_event_absent", "event_chronology_absent"],
    },
    {
        "id": "RD-W03-XCAP-01-04", "lane": "RD-04", "unit": "AL", "event": "stay",
        "cell": "RD-04:AL:stay", "route": "RD04-OFF-005", "body": "rd04-off-005.html",
        "title": "CalFresh", "mapping": "explicit_state_code", "semantic_unit": "Alabama",
        "ranges": [[19, 22], [35, 47], [51, 59]],
        "negative": ["Alabama", "stay", "hearing"],
        "positive": ["California", "CalFresh", "California Department of Social Services"],
        "reasons": ["jurisdiction_conflict", "target_unit_absent", "claimed_event_absent", "event_chronology_absent"],
    },
    {
        "id": "RD-W03-XCAP-01-05", "lane": "RD-05", "unit": "ACES-MEMBER-01", "event": "appointment",
        "cell": "RD-05:ACES-MEMBER-01:appointment", "route": "RD05-OFF-001", "body": "rd05-off-001.html",
        "title": "Advisory Committee on Excellence in Space (ACES) – Office of Space Commerce",
        "mapping": "absent_opaque_member_map", "semantic_unit": None,
        "ranges": [[3, 4], [17, 24], [38, 42]],
        "negative": ["ACES-MEMBER-01", "appointed", "appointment"],
        "positive": ["initial 17 members", "September 6, 2024", "terminated effective February 28, 2025"],
        "reasons": ["opaque_unit_id_unmapped", "member_ordinal_inference_forbidden", "committee_announcement_is_not_individual_appointment", "termination_date_is_not_appointment_chronology"],
    },
    {
        "id": "RD-W03-XCAP-01-06", "lane": "RD-05", "unit": "ACES-MEMBER-01", "event": "term",
        "cell": "RD-05:ACES-MEMBER-01:term", "route": "RD05-OFF-002", "body": "rd05-off-002.html",
        "title": "ACES Membership – Office of Space Commerce",
        "mapping": "absent_opaque_member_map", "semantic_unit": None,
        "ranges": [[4, 15], [42, 47]],
        "negative": ["ACES-MEMBER-01"],
        "positive": ["2024-2026 Appointments", "two-year terms ending August 30, 2026", "Caryn Schenewerk"],
        "reasons": ["opaque_unit_id_unmapped", "member_ordinal_inference_forbidden", "shared_term_statement_not_unit_join", "term_end_is_not_complete_event_chronology"],
    },
    {
        "id": "RD-W03-XCAP-01-07", "lane": "RD-05", "unit": "ACES-MEMBER-01", "event": "meeting_attendance",
        "cell": "RD-05:ACES-MEMBER-01:meeting_attendance", "route": "RD05-OFF-003", "body": "rd05-off-003.html",
        "title": "ACES Meetings – Office of Space Commerce",
        "mapping": "absent_opaque_member_map", "semantic_unit": None,
        "ranges": [[3, 7]],
        "negative": ["ACES-MEMBER-01", "attendance", "attended", "attendee"],
        "positive": ["March 5, 2025", "October 3, 2024", "canceled"],
        "reasons": ["opaque_unit_id_unmapped", "member_ordinal_inference_forbidden", "attendance_record_absent", "meeting_date_is_not_attendance_chronology"],
    },
    {
        "id": "RD-W03-XCAP-01-08", "lane": "RD-05", "unit": "ACES-MEMBER-01", "event": "recommendation",
        "cell": "RD-05:ACES-MEMBER-01:recommendation", "route": "RD05-OFF-005", "body": "rd05-off-005.html",
        "title": "About the NSB - National Science Board (NSB) | NSF - U.S. National Science Foundation",
        "mapping": "absent_opaque_member_map", "semantic_unit": None,
        "ranges": [[8, 18], [23, 28]],
        "negative": ["ACES-MEMBER-01", "ACES", "recommendation"],
        "positive": ["National Science Board", "recommend and encourage", "NSB"],
        "reasons": ["institution_conflict", "target_unit_absent", "claimed_event_not_attributed", "event_chronology_absent"],
    },
    {
        "id": "RD-W03-XCAP-01-09", "lane": "RD-05", "unit": "ACES-MEMBER-01", "event": "disposition",
        "cell": "RD-05:ACES-MEMBER-01:disposition", "route": "RD05-OFF-007", "body": "rd05-off-007.html",
        "title": "NSB Publications - National Science Board (NSB) | NSF - U.S. National Science Foundation",
        "mapping": "absent_opaque_member_map", "semantic_unit": None,
        "ranges": [[24, 42], [99, 114], [128, 146], [168, 180]],
        "negative": ["ACES-MEMBER-01", "ACES", "disposition"],
        "positive": ["NSB policy reports", "Published 2025", "National Science Board"],
        "reasons": ["institution_conflict", "target_unit_absent", "claimed_event_absent", "publication_date_is_not_disposition_chronology"],
    },
]


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    return sha256_bytes(path.read_bytes())


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(text)).replace("\xa0", " ")).strip()


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.body_depth = 0
        self.main_depth = 0
        self.saw_main = False
        self.all_lines: list[str] = []
        self.body_lines: list[str] = []
        self.main_lines: list[str] = []
        self.title_depth = 0
        self.title_parts: list[str] = []
        self.canonical: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr = {key: value for key, value in attrs}
        if tag in SKIP_TAGS:
            self.skip_depth += 1
        if tag == "body":
            self.body_depth += 1
        if tag == "main":
            self.main_depth += 1
            self.saw_main = True
        if tag == "title":
            self.title_depth += 1
        if tag == "link" and "canonical" in (attr.get("rel") or "").lower() and attr.get("href"):
            self.canonical.append(str(attr["href"]))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1
        if tag == "body" and self.body_depth:
            self.body_depth -= 1
        if tag == "main" and self.main_depth:
            self.main_depth -= 1
        if tag == "title" and self.title_depth:
            self.title_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        value = normalize(data)
        if not value:
            return
        if self.title_depth:
            self.title_parts.append(value)
        self.all_lines.append(value)
        if self.body_depth:
            self.body_lines.append(value)
        if self.main_depth:
            self.main_lines.append(value)


def extract_body(path: pathlib.Path) -> dict[str, Any]:
    data = path.read_bytes()
    parser = TextExtractor()
    parser.feed(data.decode("utf-8", "replace"))
    parser.close()
    raw_lines = parser.main_lines if parser.saw_main and parser.main_lines else (parser.body_lines or parser.all_lines)
    lines: list[str] = []
    for value in raw_lines:
        value = normalize(value)
        if len(value) < 2:
            continue
        if not lines or lines[-1] != value:
            lines.append(value)
    joined = "\n".join(lines)
    dates: set[str] = set()
    for pattern in DATE_PATTERNS:
        dates.update(normalize(match) for match in pattern.findall(joined))
    return {
        "bytes": len(data),
        "sha256": sha256_bytes(data),
        "title": normalize(" ".join(parser.title_parts)) or None,
        "canonical_urls": parser.canonical,
        "line_count": len(lines),
        "normalized_text_sha256": sha256_bytes(joined.encode("utf-8")),
        "candidate_dates": sorted(dates),
        "lines": lines,
    }


def count(text: str, needle: str) -> int:
    return text.casefold().count(needle.casefold())


def proof(lines: list[str], start: int, end: int) -> dict[str, Any]:
    if start < 1 or end < start or end > len(lines):
        raise ValueError(f"invalid proof range {start}-{end} for {len(lines)} lines")
    values = lines[start - 1:end]
    serialized = "\n".join(f"{index}: {value}" for index, value in zip(range(start, end + 1), values))
    return {
        "line_start": start,
        "line_end": end,
        "lines": values,
        "sha256": sha256_bytes(serialized.encode("utf-8")),
    }


def load_json(path: pathlib.Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(value)
    if actual != expected:
        raise ValueError(f"{label} keys mismatch: missing={sorted(expected-actual)} extra={sorted(actual-expected)}")


def find_route(plan: dict[str, Any], route_id: str) -> dict[str, Any]:
    matches = [row for row in plan["expanded_routes"] if row["route_id"] == route_id]
    if len(matches) != 1:
        raise ValueError(f"expected one plan route {route_id}, got {len(matches)}")
    return matches[0]


def find_result(receipt: dict[str, Any], route_id: str) -> dict[str, Any]:
    matches = [row for row in receipt["route_results"] if row["route_id"] == route_id]
    if len(matches) != 1:
        raise ValueError(f"expected one receipt route {route_id}, got {len(matches)}")
    return matches[0]


def build_protocol(capture_root: pathlib.Path, intake_root: pathlib.Path) -> dict[str, Any]:
    capture_receipt_path = capture_root / "capture" / "receipt.json"
    if sha256_file(capture_receipt_path) != CAPTURE["capture_receipt_sha256"]:
        raise ValueError("capture receipt SHA-256 mismatch")
    capture_receipt = load_json(capture_receipt_path)
    if capture_receipt["object_count"] != 9 or len(capture_receipt["objects"]) != 9:
        raise ValueError("capture object denominator mismatch")
    capture_by_id = {row["capture_object_id"]: row for row in capture_receipt["objects"]}

    intake_docs: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
    for lane, meta in INTAKE.items():
        lane_dir = intake_root / lane.lower().replace("-", "")
        plan_path = lane_dir / "plan.json"
        receipt_path = lane_dir / "receipt.json"
        if sha256_file(plan_path) != meta["plan_sha256"]:
            raise ValueError(f"{lane} plan SHA-256 mismatch")
        if sha256_file(receipt_path) != meta["receipt_sha256"]:
            raise ValueError(f"{lane} receipt SHA-256 mismatch")
        plan = load_json(plan_path)
        receipt = load_json(receipt_path)
        if plan["lane_id"] != lane or receipt["lane_id"] != lane:
            raise ValueError(f"{lane} intake identity mismatch")
        if str(receipt["workflow_run_id"]) != str(meta["run_id"]) or receipt["exact_head"] != meta["head"]:
            raise ValueError(f"{lane} intake run/head mismatch")
        intake_docs[lane] = (plan, receipt)

    reviews: list[dict[str, Any]] = []
    for spec in SPECS:
        capture_row = capture_by_id.get(spec["id"])
        if capture_row is None:
            raise ValueError(f"missing capture object {spec['id']}")
        for key, expected in (("lane_id", spec["lane"]), ("unit_id", spec["unit"]), ("event_class", spec["event"]),
                              ("cell_id", spec["cell"]), ("source_route_id", spec["route"])):
            if capture_row[key] != expected:
                raise ValueError(f"{spec['id']} capture {key} mismatch")
        if capture_row["attempt_count"] != 1 or not capture_row["ok"] or capture_row["http_status"] != 200:
            raise ValueError(f"{spec['id']} capture success invariant failed")
        if capture_row["followups_spawned"] != 0 or not capture_row["body_drift"]:
            raise ValueError(f"{spec['id']} capture custody invariant failed")
        body_path = capture_root / "capture" / "objects" / spec["body"]
        body = extract_body(body_path)
        if body["sha256"] != capture_row["body_sha256"] or body["bytes"] != capture_row["bytes"]:
            raise ValueError(f"{spec['id']} body custody mismatch")
        if body["title"] != spec["title"]:
            raise ValueError(f"{spec['id']} title mismatch: {body['title']!r}")

        plan, intake_receipt = intake_docs[spec["lane"]]
        route = find_route(plan, spec["route"])
        result = find_result(intake_receipt, spec["route"])
        if route["route_class"] != "official" or route["cell_id"] != spec["cell"]:
            raise ValueError(f"{spec['id']} official route mismatch")
        if result["route_class"] != "official" or result["cell_id"] != spec["cell"]:
            raise ValueError(f"{spec['id']} intake result mismatch")
        if result["attempt_count"] != 1 or result["followups_spawned"] != 0 or result["evidence_admitted"]:
            raise ValueError(f"{spec['id']} intake authority mismatch")

        text = "\n".join(body["lines"])
        negative_matches = [{"query": query, "match_count": count(text, query)} for query in spec["negative"]]
        positive_matches = [{"query": query, "match_count": count(text, query)} for query in spec["positive"]]
        proofs = [proof(body["lines"], start, end) for start, end in spec["ranges"]]
        reviews.append({
            "capture_object_id": spec["id"],
            "lane_id": spec["lane"],
            "unit_id": spec["unit"],
            "event_class": spec["event"],
            "cell_id": spec["cell"],
            "source_route_id": spec["route"],
            "source_contract": {
                "intake_run_id": INTAKE[spec["lane"]]["run_id"],
                "intake_artifact_id": INTAKE[spec["lane"]]["artifact_id"],
                "intake_artifact_digest": INTAKE[spec["lane"]]["artifact_digest"],
                "intake_head": INTAKE[spec["lane"]]["head"],
                "protocol_blob": INTAKE[spec["lane"]]["protocol_blob"],
                "field_matrix_blob": INTAKE[spec["lane"]]["field_matrix_blob"],
                "unit_mapping_status": spec["mapping"],
                "semantic_unit": spec["semantic_unit"],
            },
            "capture": {
                "body_path": f"capture/objects/{spec['body']}",
                "body_sha256": body["sha256"],
                "bytes": body["bytes"],
                "content_type": capture_row["content_type"],
                "requested_url": capture_row["requested_url"],
                "final_url": capture_row["final_url"],
                "http_status": capture_row["http_status"],
                "attempt_count": capture_row["attempt_count"],
                "followups_spawned": capture_row["followups_spawned"],
                "body_drift": capture_row["body_drift"],
                "initial_body_sha256": capture_row["initial_body_sha256"],
            },
            "analysis": {
                "extractor": "python-html.parser-main-or-body-v1",
                "title": body["title"],
                "canonical_urls": body["canonical_urls"],
                "line_count": body["line_count"],
                "normalized_text_sha256": body["normalized_text_sha256"],
                "candidate_dates": body["candidate_dates"],
                "negative_matches": negative_matches,
                "positive_context_matches": positive_matches,
                "proofs": proofs,
            },
            "bindings": {
                "official_object": {"status": "verified", "basis": "prebound official route, allowed final host, HTTP 200, exact body custody"},
                "unit_identity": {"status": "refused", "reason_codes": spec["reasons"]},
                "event_class": {"status": "refused", "reason_codes": spec["reasons"]},
                "chronology": {"status": "unresolved", "event_date": None, "capture_time_is_event_time": False, "reason_codes": spec["reasons"]},
                "bytes": {"status": "verified", "sha256": body["sha256"], "bytes": body["bytes"]},
            },
            "decision": {
                "status": "refused",
                "admitted": False,
                "classes_closed": 0,
                "reason_codes": spec["reasons"],
            },
        })

    summary = summarize(reviews)
    return {
        "schema_version": SCHEMA_VERSION,
        "review_id": REVIEW_ID,
        "issue": ISSUE,
        "status": "complete_offline_refusal_review",
        "parent_product": copy.deepcopy(PARENT),
        "capture_custody": copy.deepcopy(CAPTURE),
        "intake_custody": copy.deepcopy(INTAKE),
        "policy": {
            "live_source_requests": 0,
            "automatic_admission": False,
            "required_bindings": REQUIRED_BINDINGS,
            "complete_binding_set_required": True,
            "ordinal_unit_inference_allowed": False,
            "generic_context_is_event_evidence": False,
            "candidate_date_is_event_date": False,
            "capture_time_is_event_time": False,
            "one_binding_may_imply_another": False,
        },
        "authority": {
            "external_contacts": 0,
            "external_reviews": 0,
            "outside_human_dependency": False,
            "physical_user_action_required": False,
            "publication_effect": "none",
            "adoption_effect": "none",
            "graph_effect": "none",
            "merge_authority": False,
        },
        "summary": summary,
        "reviews": reviews,
    }


def summarize(reviews: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "objects": len(reviews),
        "required_bindings": len(reviews) * len(REQUIRED_BINDINGS),
        "official_object_verified": sum(row["bindings"]["official_object"]["status"] == "verified" for row in reviews),
        "bytes_verified": sum(row["bindings"]["bytes"]["status"] == "verified" for row in reviews),
        "unit_identity_verified": sum(row["bindings"]["unit_identity"]["status"] == "verified" for row in reviews),
        "event_class_verified": sum(row["bindings"]["event_class"]["status"] == "verified" for row in reviews),
        "chronology_resolved": sum(row["bindings"]["chronology"]["status"] == "resolved" for row in reviews),
        "custody_bindings_verified": sum(
            row["bindings"][binding]["status"] == "verified"
            for row in reviews for binding in ("official_object", "bytes")
        ),
        "substantive_bindings_refused": sum(
            row["bindings"][binding]["status"] in {"refused", "unresolved"}
            for row in reviews for binding in ("unit_identity", "event_class", "chronology")
        ),
        "admitted_objects": sum(row["decision"]["admitted"] for row in reviews),
        "refused_objects": sum(row["decision"]["status"] == "refused" for row in reviews),
        "classes_closed": sum(row["decision"]["classes_closed"] for row in reviews),
    }


def validate_protocol(protocol: dict[str, Any]) -> None:
    exact_keys(protocol, {"schema_version", "review_id", "issue", "status", "parent_product", "capture_custody", "intake_custody", "policy", "authority", "summary", "reviews"}, "protocol")
    if protocol["schema_version"] != SCHEMA_VERSION or protocol["review_id"] != REVIEW_ID or protocol["issue"] != ISSUE:
        raise ValueError("protocol identity mismatch")
    if protocol["status"] != "complete_offline_refusal_review":
        raise ValueError("protocol status mismatch")
    if protocol["parent_product"] != PARENT or protocol["capture_custody"] != CAPTURE or protocol["intake_custody"] != INTAKE:
        raise ValueError("custody mismatch")
    expected_policy = {
        "live_source_requests": 0,
        "automatic_admission": False,
        "required_bindings": REQUIRED_BINDINGS,
        "complete_binding_set_required": True,
        "ordinal_unit_inference_allowed": False,
        "generic_context_is_event_evidence": False,
        "candidate_date_is_event_date": False,
        "capture_time_is_event_time": False,
        "one_binding_may_imply_another": False,
    }
    if protocol["policy"] != expected_policy:
        raise ValueError("policy mismatch")
    expected_authority = {
        "external_contacts": 0, "external_reviews": 0, "outside_human_dependency": False,
        "physical_user_action_required": False, "publication_effect": "none", "adoption_effect": "none",
        "graph_effect": "none", "merge_authority": False,
    }
    if protocol["authority"] != expected_authority:
        raise ValueError("authority mismatch")
    reviews = protocol["reviews"]
    if len(reviews) != 9 or [row["capture_object_id"] for row in reviews] != [spec["id"] for spec in SPECS]:
        raise ValueError("review denominator/order mismatch")
    if protocol["summary"] != summarize(reviews):
        raise ValueError("summary mismatch")
    if protocol["summary"] != {
        "objects": 9, "required_bindings": 45, "official_object_verified": 9, "bytes_verified": 9,
        "unit_identity_verified": 0, "event_class_verified": 0, "chronology_resolved": 0,
        "custody_bindings_verified": 18, "substantive_bindings_refused": 27,
        "admitted_objects": 0, "refused_objects": 9, "classes_closed": 0,
    }:
        raise ValueError("terminal counts mismatch")
    for spec, row in zip(SPECS, reviews):
        exact_keys(row, {"capture_object_id", "lane_id", "unit_id", "event_class", "cell_id", "source_route_id", "source_contract", "capture", "analysis", "bindings", "decision"}, spec["id"])
        for key, expected in (("capture_object_id", spec["id"]), ("lane_id", spec["lane"]), ("unit_id", spec["unit"]),
                              ("event_class", spec["event"]), ("cell_id", spec["cell"]), ("source_route_id", spec["route"])):
            if row[key] != expected:
                raise ValueError(f"{spec['id']} {key} mismatch")
        if row["source_contract"]["unit_mapping_status"] != spec["mapping"] or row["source_contract"]["semantic_unit"] != spec["semantic_unit"]:
            raise ValueError(f"{spec['id']} unit mapping mismatch")
        if row["analysis"]["title"] != spec["title"]:
            raise ValueError(f"{spec['id']} title mismatch")
        if [item["query"] for item in row["analysis"]["negative_matches"]] != spec["negative"]:
            raise ValueError(f"{spec['id']} negative query mismatch")
        if [item["query"] for item in row["analysis"]["positive_context_matches"]] != spec["positive"]:
            raise ValueError(f"{spec['id']} positive query mismatch")
        if len(row["analysis"]["proofs"]) != len(spec["ranges"]):
            raise ValueError(f"{spec['id']} proof denominator mismatch")
        for item, (start, end) in zip(row["analysis"]["proofs"], spec["ranges"]):
            if item["line_start"] != start or item["line_end"] != end or len(item["lines"]) != end - start + 1:
                raise ValueError(f"{spec['id']} proof range mismatch")
            serialized = "\n".join(f"{index}: {value}" for index, value in zip(range(start, end + 1), item["lines"]))
            if item["sha256"] != sha256_bytes(serialized.encode("utf-8")):
                raise ValueError(f"{spec['id']} proof hash mismatch")
        bindings = row["bindings"]
        if set(bindings) != set(REQUIRED_BINDINGS):
            raise ValueError(f"{spec['id']} binding denominator mismatch")
        if bindings["official_object"]["status"] != "verified" or bindings["bytes"]["status"] != "verified":
            raise ValueError(f"{spec['id']} custody binding lost")
        if bindings["unit_identity"] != {"status": "refused", "reason_codes": spec["reasons"]}:
            raise ValueError(f"{spec['id']} unit decision mismatch")
        if bindings["event_class"] != {"status": "refused", "reason_codes": spec["reasons"]}:
            raise ValueError(f"{spec['id']} event decision mismatch")
        expected_chronology = {"status": "unresolved", "event_date": None, "capture_time_is_event_time": False, "reason_codes": spec["reasons"]}
        if bindings["chronology"] != expected_chronology:
            raise ValueError(f"{spec['id']} chronology decision mismatch")
        expected_decision = {"status": "refused", "admitted": False, "classes_closed": 0, "reason_codes": spec["reasons"]}
        if row["decision"] != expected_decision:
            raise ValueError(f"{spec['id']} admission decision mismatch")


def package_root_from_script() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[1]


def validate_manifest(root: pathlib.Path, manifest: dict[str, Any], protocol: dict[str, Any]) -> None:
    exact_keys(manifest, {"schema_version", "package_id", "issue", "parent_product", "permanent_paths", "protocol_sha256", "hashes", "summary", "authority"}, "manifest")
    if manifest["schema_version"] != 1 or manifest["package_id"] != "RD-W03-ADMISSION-REVIEW-PACKAGE-01" or manifest["issue"] != ISSUE:
        raise ValueError("manifest identity mismatch")
    if manifest["parent_product"] != PARENT or manifest["permanent_paths"] != PERMANENT_PATHS:
        raise ValueError("manifest parent/path mismatch")
    protocol_path = root / PERMANENT_PATHS[0]
    if manifest["protocol_sha256"] != sha256_file(protocol_path):
        raise ValueError("manifest protocol hash mismatch")
    expected_hash_paths = [path for path in PERMANENT_PATHS if not path.endswith("manifest.json")]
    if set(manifest["hashes"]) != set(expected_hash_paths):
        raise ValueError("manifest hash path denominator mismatch")
    for path in expected_hash_paths:
        if manifest["hashes"][path] != sha256_file(root / path):
            raise ValueError(f"manifest hash mismatch for {path}")
    if manifest["summary"] != protocol["summary"]:
        raise ValueError("manifest summary mismatch")
    if manifest["authority"] != protocol["authority"]:
        raise ValueError("manifest authority mismatch")


def write_manifest(root: pathlib.Path, protocol: dict[str, Any]) -> dict[str, Any]:
    hash_paths = [path for path in PERMANENT_PATHS if not path.endswith("manifest.json")]
    return {
        "schema_version": 1,
        "package_id": "RD-W03-ADMISSION-REVIEW-PACKAGE-01",
        "issue": ISSUE,
        "parent_product": copy.deepcopy(PARENT),
        "permanent_paths": PERMANENT_PATHS,
        "protocol_sha256": sha256_file(root / PERMANENT_PATHS[0]),
        "hashes": {path: sha256_file(root / path) for path in hash_paths},
        "summary": copy.deepcopy(protocol["summary"]),
        "authority": copy.deepcopy(protocol["authority"]),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--verify-inputs", action="store_true")
    parser.add_argument("--write-manifest", action="store_true")
    parser.add_argument("--capture-root", type=pathlib.Path)
    parser.add_argument("--intake-root", type=pathlib.Path)
    parser.add_argument("--package-root", type=pathlib.Path)
    args = parser.parse_args(argv)
    root = (args.package_root or package_root_from_script()).resolve()
    protocol_path = root / PERMANENT_PATHS[0]
    manifest_path = root / PERMANENT_PATHS[1]

    if args.build or args.verify_inputs:
        if args.capture_root is None or args.intake_root is None:
            parser.error("--capture-root and --intake-root are required")
        generated = build_protocol(args.capture_root.resolve(), args.intake_root.resolve())
        validate_protocol(generated)
        if args.build:
            protocol_path.parent.mkdir(parents=True, exist_ok=True)
            protocol_path.write_text(canonical_json(generated), encoding="utf-8")
        if args.verify_inputs:
            existing = load_json(protocol_path)
            if canonical_json(existing) != canonical_json(generated):
                raise ValueError("immutable inputs do not regenerate the committed protocol")
            print("RD-W03 admission review immutable-input replay: PASS")

    if args.write_manifest:
        protocol = load_json(protocol_path)
        validate_protocol(protocol)
        manifest = write_manifest(root, protocol)
        manifest_path.write_text(canonical_json(manifest), encoding="utf-8")

    if args.check or not any((args.build, args.verify_inputs, args.write_manifest)):
        protocol = load_json(protocol_path)
        manifest = load_json(manifest_path)
        validate_protocol(protocol)
        validate_manifest(root, manifest, protocol)
        summary = protocol["summary"]
        print(
            "RD-W03 admission review: PASS "
            f"({summary['objects']} objects, {summary['custody_bindings_verified']} custody bindings, "
            f"{summary['substantive_bindings_refused']} substantive refusals, "
            f"{summary['admitted_objects']} admissions, {summary['classes_closed']} closures)"
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        print(f"RD-W03 admission review failed: {error}", file=sys.stderr)
        raise SystemExit(1)
