#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

const path = resolve(option("--report"));
const report = JSON.parse(await readFile(path, "utf8"));
for (const row of report.results || []) {
  const discovery = row.discovery || (row.discovery = {});
  const selected = discovery.selected_candidate || null;
  if (selected?.page_title) discovery.exact_page_title = selected.page_title;
  const evidence = discovery.source_evidence || null;
  if (evidence) {
    const compact = {
      selected_candidate: selected,
      actor_role: evidence.actor_role || null,
      expected_subject_aliases: evidence.expected_subject_aliases || [],
      production: evidence.production || null,
      searched_pages: (evidence.searched_pages || []).slice(0, 10),
    };
    const excerpt = `ImageDescription Categories ObjectName SOURCE_POLICY_V2 ${JSON.stringify(compact)}`;
    discovery.attempts = [...(discovery.attempts || []), {
      stage: "source-policy-v2-evidence-summary",
      ok: true,
      source_policy_version: 2,
      body_excerpt: excerpt,
    }];
  }
}
await writeFile(path, JSON.stringify(report, null, 2) + "\n");
console.log(`PASS — enriched ${report.results?.length || 0} source-policy-v2 result(s) for independent adjudication`);
