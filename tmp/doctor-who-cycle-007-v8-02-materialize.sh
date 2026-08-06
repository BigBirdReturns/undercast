#!/usr/bin/env bash
set -euo pipefail
: "${OUT:?}" "${CYCLE_ASSET_DIR:?}" "${CYCLE_CONTEXT:?}"
node "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-007.mjs" 2>&1 | tee "$OUT/materialize.log"
test -s "$CYCLE_CONTEXT"

node --input-type=module <<'NODE'
import fs from "node:fs";

const path = "tests/rendered/site.spec.mjs";
let source = fs.readFileSync(path, "utf8");
const replacements = [
  [
    'const specimens=JSON.parse(await readFile(new URL("../../data/specimens.json",import.meta.url),"utf8"));\nconst mediaLive=JSON.parse(await readFile(new URL("../../data/media-live.json",import.meta.url),"utf8"));',
    'const specimens=JSON.parse(await readFile(new URL("../../data/specimens.json",import.meta.url),"utf8"));\nconst decadeOf=years=>{\n  const match=String(years).match(/\\d{4}/);\n  if(!match) return "—";\n  const decade=Math.floor(Number.parseInt(match[0],10)/10)*10;\n  return decade<1970?"pre-70s":`${String(decade).slice(2)}s`;\n};\nconst mediaLive=JSON.parse(await readFile(new URL("../../data/media-live.json",import.meta.url),"utf8"));',
    "decade helper",
  ],
  [
    '  await expect(page.locator("#result-status")).toHaveText("89 specimens match; 89 shown.");',
    '  const currentDecadeCount=specimens.filter(record=>decadeOf(record.years)==="20s").length;\n  await expect(page.locator("#result-status")).toHaveText(`${currentDecadeCount} specimens match; ${currentDecadeCount} shown.`);',
    "data-derived decade assertion",
  ],
];
for (const [before, after, label] of replacements) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label} anchor cardinality drifted: ${count}`);
  source = source.replace(before, after);
}
fs.writeFileSync(path, source);
NODE
node --check tests/rendered/site.spec.mjs

test -z "$(git diff --name-only | grep '^\.github/workflows/' || true)"
git status --short > "$OUT/candidate-status.txt"
test -s "$OUT/candidate-status.txt"
