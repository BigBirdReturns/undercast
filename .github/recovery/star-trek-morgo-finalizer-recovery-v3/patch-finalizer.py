#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import ast
import difflib
import hashlib
import json
import sys


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def offsets(text: str) -> list[int]:
    values = [0]
    for line in text.splitlines(keepends=True):
        values.append(values[-1] + len(line))
    return values


def absolute(line_offsets: list[int], line: int, column: int) -> int:
    return line_offsets[line - 1] + column


def call_name(node: ast.AST) -> str | None:
    return node.id if isinstance(node, ast.Name) else None


def is_artifact_tuple(node: ast.AST) -> bool:
    if not isinstance(node, (ast.Tuple, ast.List)) or len(node.elts) != 1:
        return False
    element = node.elts[0]
    return isinstance(element, ast.Constant) and element.value == "artifact"


def find_claim_call(tree: ast.Module) -> ast.Call:
    found: list[ast.Call] = []
    for top in tree.body:
        if (
            not isinstance(top, (ast.FunctionDef, ast.AsyncFunctionDef))
            or top.name != "verify_input_documents"
        ):
            continue
        for node in ast.walk(top):
            if not isinstance(node, ast.Dict):
                continue
            for key, value in zip(node.keys, node.values):
                if (
                    isinstance(key, ast.Constant)
                    and key.value == "claim"
                    and isinstance(value, ast.Call)
                    and call_name(value.func) == "verify_identity"
                ):
                    source_arg = ast.unparse(value.args[0]) if value.args else ""
                    field_arg = (
                        value.args[1].value
                        if len(value.args) > 1
                        and isinstance(value.args[1], ast.Constant)
                        else None
                    )
                    if (
                        "claim-receipt.json" in source_arg
                        and field_arg == "receipt_sha256"
                    ):
                        found.append(value)
    if len(found) != 1:
        raise SystemExit(
            f"expected exactly one claim identity call, found {len(found)}"
        )
    return found[0]


def main() -> None:
    if len(sys.argv) != 5:
        raise SystemExit(
            "usage: patch-finalizer.py ORIGINAL PATCHED RECEIPT DIFF"
        )

    original_path = Path(sys.argv[1])
    patched_path = Path(sys.argv[2])
    receipt_path = Path(sys.argv[3])
    diff_path = Path(sys.argv[4])

    original = original_path.read_text(encoding="utf-8")
    tree = ast.parse(original)
    call = find_claim_call(tree)

    positional_omission = (
        len(call.args) == 4 and is_artifact_tuple(call.args[3])
    )
    omission_keyword = next(
        (
            keyword
            for keyword in call.keywords
            if keyword.arg in {"omitted", "removable"}
            and is_artifact_tuple(keyword.value)
        ),
        None,
    )
    if not positional_omission and omission_keyword is None:
        raise SystemExit(
            "claim identity call does not expose the expected artifact-omission defect"
        )

    retained_args = [ast.unparse(argument) for argument in call.args[:3]]
    retained_keywords = [
        f"{keyword.arg}={ast.unparse(keyword.value)}"
        for keyword in call.keywords
        if keyword is not omission_keyword
    ]
    replacement = (
        "verify_identity(" + ", ".join(retained_args + retained_keywords) + ")"
    )

    line_offsets = offsets(original)
    start = absolute(line_offsets, call.lineno, call.col_offset)
    end = absolute(
        line_offsets,
        call.end_lineno or call.lineno,
        call.end_col_offset or call.col_offset,
    )
    patched = original[:start] + replacement + original[end:]

    patched_tree = ast.parse(patched)
    repaired = find_claim_call(patched_tree)
    if len(repaired.args) != 3:
        raise SystemExit(
            f"claim identity call retains {len(repaired.args)} positional arguments"
        )
    if any(
        keyword.arg in {"omitted", "removable"}
        for keyword in repaired.keywords
    ):
        raise SystemExit("claim identity call still contains an omission keyword")

    compile(patched, str(patched_path), "exec")
    patched_path.parent.mkdir(parents=True, exist_ok=True)
    patched_path.write_text(patched, encoding="utf-8")
    patched_path.chmod(0o755)

    diff = "".join(
        difflib.unified_diff(
            original.splitlines(keepends=True),
            patched.splitlines(keepends=True),
            fromfile="sealed-v2/finalizer.py",
            tofile="recovered-v3/finalizer.py",
        )
    )
    diff_path.parent.mkdir(parents=True, exist_ok=True)
    diff_path.write_text(diff, encoding="utf-8")

    receipt = {
        "version": 1,
        "transaction": "STAR-TREK-MORGO-FINALIZER-IDENTITY-REPAIR-V1",
        "patched_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "classification": "claim-artifact-inclusion-contract",
        "repair_mode": (
            "remove-fourth-positional-artifact-omission"
            if positional_omission
            else "remove-artifact-omission-keyword"
        ),
        "original_sha256": sha256_bytes(original.encode()),
        "patched_sha256": sha256_bytes(patched.encode()),
        "expected_claim_receipt_sha256": (
            "dd0f6787c555c110185bc8b5cc2b234e299791401b9bdec6a0088ba6a5217fb4"
        ),
        "known_without_artifact_sha256": (
            "644a36fa8aa531fc53b23661f775fb08ccfb6dae6f281bc8065c86da293502db"
        ),
        "semantic_scope": [
            "include the claim receipt's Actions artifact in its stable identity",
        ],
        "product_logic_changed": False,
        "waterline_logic_changed": False,
        "media_or_attribution_logic_changed": False,
        "canonical_mutation": False,
        "additional_lease_issued": False,
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(
        json.dumps(receipt, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
