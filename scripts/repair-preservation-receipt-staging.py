#!/usr/bin/env python3
from pathlib import Path


def replace_one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new)


def repair_reconciliation() -> None:
    path = Path(".github/workflows/reconcile-estate-preservation.yml")
    text = path.read_text(encoding="utf-8")
    text = replace_one(
        text,
        "on:\n  push:\n",
        "on:\n  workflow_dispatch:\n  push:\n",
        "manual recovery dispatch",
    )
    text = replace_one(
        text,
        "if (run.status !== 'completed' || run.conclusion !== 'failure') throw new Error(`expected completed failed preservation run, found ${run.status}/${run.conclusion}`);",
        "if (run.status !== 'completed' || !new Set(['success', 'failure']).has(run.conclusion)) throw new Error(`expected a completed preservation source run, found ${run.status}/${run.conclusion}`);",
        "source run conclusion contract",
    )
    text = replace_one(
        text,
        "if (!failed_steps.length) throw new Error('failed preservation run exposes no failed step');",
        "if (run.conclusion === 'failure' && !failed_steps.length) throw new Error('failed preservation run exposes no failed step');",
        "conditional failed-step contract",
    )
    text = replace_one(
        text,
        "original_workflow: failure,",
        "source_workflow: failure,",
        "source workflow receipt label",
    )
    text = replace_one(
        text,
        "failed_run_treated_as_acceptance: false,",
        "source_run_success_treated_as_registry_publication: false,",
        "source success boundary",
    )
    text = replace_one(
        text,
        "failed_preservation_run=",
        "source_preservation_run=",
        "commit custody label",
    )
    text = replace_one(
        text,
        "The failed preservation run was retained as failure evidence and was not treated as acceptance; its already-published immutable bytes were independently reverified before their registry receipt was adopted.",
        "The successful preservation export was retained as source evidence but was not treated as proof that its registry reached main; its already-published immutable bytes were independently reverified before their registry receipt was adopted.",
        "terminal explanation",
    )
    path.write_text(text, encoding="utf-8")


def repair_preserve_workflow() -> None:
    path = Path(".github/workflows/preserve.yml")
    text = path.read_text(encoding="utf-8")
    old = """          git add preservation/SNAPSHOTS.json data/AUTOPILOT-CERTIFICATIONS.json \\
            data/AUTOPILOT-SCOPES.json data/AUTOPILOT.json data/journal/autopilot.jsonl \\
            preservation/BOOTSTRAP-PENDING 2>/dev/null || true
"""
    new = """          git add preservation/SNAPSHOTS.json data/AUTOPILOT-CERTIFICATIONS.json \\
            data/AUTOPILOT-SCOPES.json data/AUTOPILOT.json data/journal/autopilot.jsonl
          if [ -e preservation/BOOTSTRAP-PENDING ]; then
            git add preservation/BOOTSTRAP-PENDING
          fi
"""
    text = replace_one(text, old, new, "preservation receipt staging")
    path.write_text(text, encoding="utf-8")


def add_fixture_coverage() -> None:
    path = Path("scripts/preservation-fixtures.mjs")
    text = path.read_text(encoding="utf-8")
    marker = "console.log(failures ? `\\n${failures} preservation fixture(s) FAILED` : '\\nall preservation fixtures pass');\n"
    addition = """const workflowPath = fileURLToPath(new URL('../.github/workflows/preserve.yml', import.meta.url));
const workflow = await readFile(workflowPath, 'utf8');
expect('preservation workflow does not swallow required receipt staging errors', /git add preservation\\/SNAPSHOTS\\.json[\\s\\S]*data\\/journal\\/autopilot\\.jsonl\\n\\s*if \[ -e preservation\\/BOOTSTRAP-PENDING \]; then/.test(workflow), true);
expect('optional bootstrap marker is staged conditionally', workflow.includes('if [ -e preservation/BOOTSTRAP-PENDING ]; then\\n            git add preservation/BOOTSTRAP-PENDING\\n          fi'), true);
expect('preservation workflow has no broad git-add error suppression', /git add preservation\\/SNAPSHOTS\\.json[\\s\\S]{0,400}\\|\\| true/.test(workflow), false);

"""
    text = replace_one(text, marker, addition + marker, "workflow staging fixtures")
    path.write_text(text, encoding="utf-8")


repair_reconciliation()
repair_preserve_workflow()
add_fixture_coverage()
print("preservation receipt staging and source-run semantics repaired")
