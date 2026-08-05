#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

LANE_BASE = "318e7fd2826511c283e2d81622459fe0bb74e0d2"
CELL_HASH = "63dedc75d08cf4cc00eb57c1c63303ce92054a8e5a77457c4d8ff93a0af6e0e0"
MATRIX_HASH = "a7c57f94896f54e13b85fde6fc9d9e7f4ec3a2b82118e4cbecee2cd533a48ab7"
ROUTE_ID_HASH = "fee8601ab821353b04394ec329561d96793503bc6a79ad9ec85a8f4fa60e4caa"
ROUTE_URL_HASH = "c92d97c743419bd0af7138152fff04509a78d706134d65ec113e7bc06de0b19a"

FINAL_SHA256 = {
    ".github/workflows/rd-wave03-rd01-intake.yml": "1a07b18ecbd6fcf0bfbfbee6336e7e2cf42b819249d3a92ef08b9eba0493c494",
    ".github/workflows/rd-wave03-rd02-intake.yml": "d5c547c5378671c481787abe2264ed755ce6eb187c45638a21ffa3eb2fb52642",
    ".github/workflows/rd-wave03-rd03-intake.yml": "155819fd45ccf62c922ac03e09113fff29a599f98009355c945f9e91c747c037",
    ".github/workflows/rd-wave03-rd04-intake.yml": "5dc28123c98595b719cc8d409f4c9c4378a0af0706dd8b654d4f67e7742c0dbd",
    ".github/workflows/rd-wave03-rd05-intake.yml": "3b9a0410ec7d84e76253231d8c3e855e18748ea749a0af8fa695b70ccafe4155",
    ".github/workflows/rd-wave03-rd06-intake.yml": "2c915c337741b529cc05ea71a2b0c5aa1127a729daec334e1fbd06e3c790b97d",
    "data/research/residual-denominator/wave-03/rd-06/field-matrix.json": "a7c57f94896f54e13b85fde6fc9d9e7f4ec3a2b82118e4cbecee2cd533a48ab7",
    "data/research/residual-denominator/wave-03/rd-06/protocol.json": "037cf0365f665801642c6ec3df66eb2d913680a2e51f2a90e34d555714f11dd5",
    "scripts/rd-wave03-rd05-build.mjs": "ec34da744a101c9e92a2907e0a5abec9602642d0349d46c0006622f18838e479",
    "scripts/rd-wave03-rd05-validate.mjs": "1f657237a9028a7ef2aa39c67c2d02c878d9e26744219c00e3ea3465e139367e",
    "scripts/rd-wave03-rd06-validate.mjs": "4f65e1bd349a020297533c3927c1f957dc0447dabf9c409e1ddb8159ba4d5bd3",
}


def fail(message: str) -> None:
    raise SystemExit(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{label}: expected one occurrence, found {count}")
    return text.replace(old, new)


def stable_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, indent=2) + "\n"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patch_workflow(root: Path, lane: str) -> str:
    compact = f"rd{lane}"
    path = root / f".github/workflows/rd-wave03-{compact}-intake.yml"
    text = path.read_text()
    text = replace_once(
        text,
        f"      OUT: ${{{{ runner.temp }}}}/rd-wave03-{compact}-intake\n",
        "",
        f"RD-{lane} workflow OUT",
    )
    text = replace_once(
        text,
        f'run: GITHUB_SHA="$EXPECTED_HEAD" node scripts/rd-wave03-{compact}-build.mjs --execute --out "$OUT"',
        f'run: GITHUB_SHA="$EXPECTED_HEAD" node scripts/rd-wave03-{compact}-build.mjs --execute --out "$RUNNER_TEMP/rd-wave03-{compact}-intake"',
        f"RD-{lane} workflow execute",
    )
    text = replace_once(
        text,
        f'run: node scripts/rd-wave03-{compact}-build.mjs --verify-receipt "$OUT/receipt.json"',
        f'run: node scripts/rd-wave03-{compact}-build.mjs --verify-receipt "$RUNNER_TEMP/rd-wave03-{compact}-intake/receipt.json"',
        f"RD-{lane} workflow receipt",
    )
    path.write_text(text)
    return str(path.relative_to(root))


def patch_rd05(root: Path) -> list[str]:
    changed = []
    build = root / "scripts/rd-wave03-rd05-build.mjs"
    text = replace_once(
        build.read_text(),
        "process.stdout.write(stableJson(buildPlan(DEFAULT_ROOT));",
        "process.stdout.write(stableJson(buildPlan(DEFAULT_ROOT)));",
        "RD-05 builder syntax",
    )
    build.write_text(text)
    changed.append(str(build.relative_to(root)))

    validator = root / "scripts/rd-wave03-rd05-validate.mjs"
    text = replace_once(
        validator.read_text(),
        'const EXPECTED_SCHEMA_SHA256 = "fc2fc3c2d19ad9ca38f2bf546d58ec7400691a7f11ac4e00026fe5fde2a762e1";',
        'const EXPECTED_SCHEMA_SHA256 = "fac1f1cc1372c4f323f5d2dd15990a8cd3ea832d935aa7db0acfbb1abebe2a94";',
        "RD-05 schema hash",
    )
    validator.write_text(text)
    changed.append(str(validator.relative_to(root)))
    return changed


def patch_rd06(root: Path) -> list[str]:
    changed = []
    validator = root / "scripts/rd-wave03-rd06-validate.mjs"
    text = replace_once(
        validator.read_text(),
        'const EXPECTED_SCHEMA_SHA256 = "51bef35fa6096af641d45ba6ae4bfc2e84b8645acd3f77e8c9eef2cb00f8fcd2";',
        'const EXPECTED_SCHEMA_SHA256 = "0f444c78251b5fe55e757618844a359fdbc050f8cf6282ccedf18a8c45b3745c";',
        "RD-06 schema hash",
    )
    validator.write_text(text)
    changed.append(str(validator.relative_to(root)))

    matrix_path = root / "data/research/residual-denominator/wave-03/rd-06/field-matrix.json"
    matrix = json.loads(matrix_path.read_text())
    if matrix.get("cell_ids_sha256") != "917a494f4c87b2b0a3df3dfd4f728e8ed6e5d8adf111a11159b8817510695f7b":
        fail("RD-06 matrix old cell hash mismatch")
    matrix["cell_ids_sha256"] = CELL_HASH
    matrix_path.write_text(stable_json(matrix))
    if sha256(matrix_path) != MATRIX_HASH:
        fail("RD-06 corrected matrix bytes mismatch")
    changed.append(str(matrix_path.relative_to(root)))

    protocol_path = root / "data/research/residual-denominator/wave-03/rd-06/protocol.json"
    protocol = json.loads(protocol_path.read_text())
    old_matrix = protocol.get("matrix", {})
    if old_matrix.get("cell_ids_sha256") != "917a494f4c87b2b0a3df3dfd4f728e8ed6e5d8adf111a11159b8817510695f7b":
        fail("RD-06 protocol old cell hash mismatch")
    if old_matrix.get("contract_sha256") != "b6c21a4b8f00c891ad1ed7dd0039ccdbb60561202532a478da5d9fd1f4cd5c85":
        fail("RD-06 protocol old matrix hash mismatch")
    routes = protocol.get("routes", {})
    if routes.get("expanded_route_ids_sha256") != "d5f51d83ff9a5d60d526965d571fe394b0f9c01b85db1832c48fd793c798755e":
        fail("RD-06 old route-ID hash mismatch")
    if routes.get("expanded_route_urls_sha256") != "a11977fbd4b6f39d72847592adf22fb3227e12c4f8411f2f45797d347c864a79":
        fail("RD-06 old route-URL hash mismatch")
    protocol["matrix"]["cell_ids_sha256"] = CELL_HASH
    protocol["matrix"]["contract_sha256"] = MATRIX_HASH
    protocol["routes"]["expanded_route_ids_sha256"] = ROUTE_ID_HASH
    protocol["routes"]["expanded_route_urls_sha256"] = ROUTE_URL_HASH
    protocol_path.write_text(stable_json(protocol))
    changed.append(str(protocol_path.relative_to(root)))
    return changed


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: rd-wave03-atomic-repair.py ROOT LANE")
    root = Path(sys.argv[1]).resolve()
    lane = sys.argv[2]
    if lane not in {"01", "02", "03", "04", "05", "06"}:
        fail(f"invalid lane {lane}")

    changed = [patch_workflow(root, lane)]
    if lane == "05":
        changed.extend(patch_rd05(root))
    if lane == "06":
        changed.extend(patch_rd06(root))
    changed = sorted(changed)

    for rel in changed:
        expected = FINAL_SHA256.get(rel)
        if expected is None:
            fail(f"no expected SHA-256 for {rel}")
        actual = sha256(root / rel)
        if actual != expected:
            fail(f"{rel}: SHA-256 {actual} != {expected}")

    print(json.dumps({"lane": f"RD-{lane}", "changed_paths": changed, "sha256": {p: FINAL_SHA256[p] for p in changed}}, sort_keys=True))


if __name__ == "__main__":
    main()
