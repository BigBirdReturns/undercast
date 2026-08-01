#!/usr/bin/env node
import fs from "node:fs";

const workflowPath = ".github/workflows/card-backfill-amortized-wave.yml";
const fixturePath = "scripts/card-backfill-amortization-fixtures.mjs";

let workflow = fs.readFileSync(workflowPath, "utf8");
const marker = "Yield the exact reduced head to the supervisor";

if (!workflow.includes(marker)) {
  const anchor = [
    '          git push origin "HEAD:${GITHUB_REF_NAME}"',
    "          echo 'PASS — one reducer committed attempts, staging, and the next cost model'",
    "",
    "      - uses: actions/upload-artifact@v4",
    "        if: always()",
  ].join("\n");

  const stepTemplate = String.raw`          git push origin "HEAD:__DOLLAR__{GITHUB_REF_NAME}"
          echo 'PASS — one reducer committed attempts, staging, and the next cost model'

      - name: Yield the exact reduced head to the supervisor
        env:
          GH_TOKEN: __GH_TOKEN_EXPRESSION__
          MUTATION_HEAD: __MUTATION_HEAD_EXPRESSION__
        run: |
          set -euo pipefail
          reduced_head=$(git rev-parse HEAD)
          remote_head=$(git ls-remote origin "refs/heads/__DOLLAR__{GITHUB_REF_NAME}" | awk '{print __DOLLAR__1}')
          if [ "__DOLLAR__remote_head" != "__DOLLAR__reduced_head" ]; then
            echo "branch moved from reduced head __DOLLAR__reduced_head to __DOLLAR__remote_head; refusing stale supervisor yield" >&2
            exit 1
          fi
          if [ "__DOLLAR__reduced_head" = "__DOLLAR__MUTATION_HEAD" ]; then
            echo 'PASS — reduction was already present; yielding the existing exact head'
          else
            echo "PASS — reduction committed __DOLLAR__MUTATION_HEAD -> __DOLLAR__reduced_head"
          fi
          active_json=$(gh run list \
            --repo "__DOLLAR__GITHUB_REPOSITORY" \
            --workflow card-backfill-supervisor.yml \
            --branch "__DOLLAR__GITHUB_REF_NAME" \
            --limit 50 \
            --json headSha,status)
          active=$(node -e 'const rows=JSON.parse(process.argv[1]);const head=process.argv[2];const active=new Set(["queued","in_progress","waiting","pending","requested"]);process.stdout.write(String(rows.filter((row)=>row.headSha===head&&active.has(row.status)).length))' "__DOLLAR__active_json" "__DOLLAR__reduced_head")
          if [ "__DOLLAR__active" -gt 0 ]; then
            echo "PASS — exact-head supervisor already active (__DOLLAR__active); duplicate yield refused"
          else
            gh workflow run card-backfill-supervisor.yml \
              --repo "__DOLLAR__GITHUB_REPOSITORY" \
              --ref "__DOLLAR__GITHUB_REF_NAME" \
              -f reason=amortized-wave-reduced
            echo 'PASS — reducer yielded the exact current head to the supervisor'
          fi
          gh api -X POST \
            "repos/__DOLLAR__{GITHUB_REPOSITORY}/statuses/__DOLLAR__reduced_head" \
            -f state=success \
            -f context='card-backfill/reducer-yield' \
            -f description='exact reduced head yielded to supervisor; manual_continue_required=false' \
            -f target_url="__DOLLAR__{GITHUB_SERVER_URL}/__DOLLAR__{GITHUB_REPOSITORY}/actions/runs/__DOLLAR__{GITHUB_RUN_ID}"
          echo 'manual_continue_required=false'

      - uses: actions/upload-artifact@v4
        if: always()`;

  let replacement = stepTemplate.replaceAll("__DOLLAR__", "$");
  replacement = replacement.replace("__GH_TOKEN_EXPRESSION__", "$" + "{{ secrets.GITHUB_TOKEN }}");
  replacement = replacement.replace("__MUTATION_HEAD_EXPRESSION__", "$" + "{{ steps.mutation.outputs.mutation_head }}");

  const anchorCount = workflow.split(anchor).length - 1;
  if (anchorCount !== 1) {
    throw new Error(`expected one reducer commit anchor, found ${anchorCount}`);
  }
  workflow = workflow.replace(anchor, replacement);
  fs.writeFileSync(workflowPath, workflow);
}

let fixture = fs.readFileSync(fixturePath, "utf8");
const fixtureAnchor = `  "rediscovery:false",
]) assert(files.workflow.includes(needle), \`amortized workflow guard missing \${needle}\`);`;
const fixtureReplacement = `  "rediscovery:false",
  "Yield the exact reduced head to the supervisor",
  "card-backfill-supervisor.yml",
  "reason=amortized-wave-reduced",
  "card-backfill/reducer-yield",
  "manual_continue_required=false",
]) assert(files.workflow.includes(needle), \`amortized workflow guard missing \${needle}\`);`;

if (!fixture.includes('"reason=amortized-wave-reduced"')) {
  const fixtureCount = fixture.split(fixtureAnchor).length - 1;
  if (fixtureCount !== 1) {
    throw new Error(`expected one amortization fixture anchor, found ${fixtureCount}`);
  }
  fixture = fixture.replace(fixtureAnchor, fixtureReplacement);
  fs.writeFileSync(fixturePath, fixture);
}

const finalWorkflow = fs.readFileSync(workflowPath, "utf8");
const finalFixture = fs.readFileSync(fixturePath, "utf8");
for (const needle of [
  marker,
  "card-backfill-supervisor.yml",
  "reason=amortized-wave-reduced",
  "card-backfill/reducer-yield",
  "manual_continue_required=false",
]) {
  if (!finalWorkflow.includes(needle)) throw new Error(`durable reducer yield missing ${needle}`);
  if (!finalFixture.includes(needle)) throw new Error(`reducer-yield fixture missing ${needle}`);
}

console.log("PASS — exact-head reducer-to-supervisor yield and regression contract installed");
