const DEFAULT_ACTIVE_STATES = ["active-corpus", "gold-reference"];
const DEFAULT_IN_FLIGHT = ["leased", "drafted", "merged"];

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function integerAtLeast(value, floor) {
  return Number.isInteger(value) && value >= floor;
}

export function validateThesisRails(config) {
  const errors = [];
  if (config?.version !== 1) errors.push("thesis rails must be version 1");
  if (config?.schema !== "undercast-thesis-rails@1") errors.push("thesis rails schema must be undercast-thesis-rails@1");
  if (config?.project !== "UNDERCAST") errors.push("thesis rails project must be UNDERCAST");
  if (!nonEmptyString(config?.thesis)) errors.push("thesis rails must state the project thesis");
  if (!Array.isArray(config?.active_estate_states) || !config.active_estate_states.length) errors.push("active_estate_states is empty");
  if (!Array.isArray(config?.in_flight_statuses) || !config.in_flight_statuses.length) errors.push("in_flight_statuses is empty");
  if (!nonEmptyString(config?.default_agent)) errors.push("default_agent is missing");
  if (!nonEmptyString(config?.capability_profile)) errors.push("capability_profile is missing");
  if (!integerAtLeast(config?.batch_limit, 1) || config.batch_limit !== 1) errors.push("batch_limit must remain exactly 1");
  for (const key of ["batch_path", "autopilot_prompt_path", "continuation_prompt_path"]) {
    if (!nonEmptyString(config?.[key])) errors.push(`${key} is missing`);
  }
  const terminal = config?.terminal_contract;
  if (terminal?.maximum_tasks_per_cycle !== 1) errors.push("terminal contract must permit exactly one task per cycle");
  if (terminal?.required_in_flight !== 0) errors.push("terminal contract must require zero in-flight work");
  if (terminal?.required_media_debt !== 0) errors.push("terminal contract must require zero media debt");
  if (terminal?.required_unreceipted_cycles !== 0) errors.push("terminal contract must require zero unreceipted cycles");
  if (terminal?.temporary_cycle_refs !== 0) errors.push("terminal contract must require zero temporary cycle refs");
  if (terminal?.maker_attribution_may_remain_unresolved !== true) errors.push("unresolved maker attribution must remain nonblocking");
  if (terminal?.require_reviewed_cycle_receipt !== true) errors.push("a reviewed cycle receipt must remain mandatory");
  const product = config?.product_contract;
  for (const key of [
    "character_to_performer_reveal",
    "separate_character_and_performer_media",
    "exact_subject_or_honest_absence",
    "source_receipts_required",
    "maker_credit_requires_exact_source",
    "collection_only",
  ]) if (product?.[key] !== true) errors.push(`product contract ${key} must be true`);
  if (!Array.isArray(config?.forbidden_default_work) || config.forbidden_default_work.length < 6) errors.push("forbidden_default_work is incomplete");
  const policy = config?.workflow_policy;
  if (!nonEmptyString(policy?.cycle_workflow_pattern)) errors.push("cycle workflow pattern is missing");
  else {
    try { new RegExp(policy.cycle_workflow_pattern); }
    catch (error) { errors.push(`cycle workflow pattern is invalid: ${error.message}`); }
  }
  if (!Array.isArray(policy?.forbidden_stage_tokens) || !policy.forbidden_stage_tokens.length) errors.push("forbidden workflow stage token list is empty");
  if (!integerAtLeast(policy?.minimum_enforced_cycle, 1)) errors.push("minimum_enforced_cycle is invalid");
  if (!integerAtLeast(policy?.maximum_changed_cycle_workflows_per_pr, 1)) errors.push("maximum_changed_cycle_workflows_per_pr is invalid");
  if (!nonEmptyString(policy?.terminal_product_marker)) errors.push("terminal product marker is missing");
  if (!Array.isArray(policy?.exception_markers) || policy.exception_markers.length < 3) errors.push("workflow exception markers are incomplete");
  if (!Array.isArray(config?.required_files) || config.required_files.length < 6) errors.push("required_files is incomplete");
  return errors;
}

function activeStates(config) {
  return new Set(config?.active_estate_states || DEFAULT_ACTIVE_STATES);
}

function inFlightStatuses(config) {
  return new Set(config?.in_flight_statuses || DEFAULT_IN_FLIGHT);
}

export function countJobs(jobs, scopeId, config = null) {
  const counts = { total: 0, queued: 0, blocked: 0, attention: 0, resolved: 0, leased: 0, drafted: 0, merged: 0, in_flight: 0 };
  const inFlight = inFlightStatuses(config);
  for (const job of jobs || []) {
    if (scopeId && job.scope !== scopeId) continue;
    counts.total += 1;
    const status = job.status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
    if (inFlight.has(status)) counts.in_flight += 1;
  }
  return counts;
}

export function countMedia(items, scopeId) {
  const counts = { total: 0, verified: 0, absent: 0, review: 0, attention: 0, debt: 0 };
  for (const item of items || []) {
    if (scopeId && item.scope !== scopeId) continue;
    counts.total += 1;
    const status = item.status || "unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  counts.debt = (counts.review || 0) + (counts.attention || 0);
  return counts;
}

export function unreceiptedCycleCount(waterline) {
  const value = waterline?.cycles?.unreceipted;
  if (Array.isArray(value)) return value.length;
  if (Number.isInteger(value)) return value;
  return 0;
}

function candidateRow(report) {
  const row = report?.compatible?.[0];
  if (!row) return null;
  return {
    task_id: row.task_id || row.id || null,
    performer: row.performer || null,
    character: row.character || null,
    priority: row.priority ?? null,
    performance_modes: Array.isArray(row.performance_modes) ? row.performance_modes : [],
    required_capabilities: Array.isArray(row.required_capabilities) ? row.required_capabilities : [],
    sources: Array.isArray(row.sources) ? row.sources : [],
    source_fingerprint: row.source_fingerprint || null,
  };
}

function waterlineSummary(waterline) {
  if (!waterline) return null;
  return {
    phase: waterline.phase || null,
    claim_allowed: waterline.claim_allowed === true,
    claim_reasons: Array.isArray(waterline.claim_reasons) ? waterline.claim_reasons : [],
    media_debt: waterline?.media?.debt ?? null,
    unreceipted_cycles: unreceiptedCycleCount(waterline),
    max_tasks_per_cycle: waterline?.capacity?.max_tasks_per_cycle ?? null,
  };
}

function activeEstateRows({ config, registry, jobs, audit, waterlines }) {
  const states = activeStates(config);
  return (registry?.estates || [])
    .filter((estate) => states.has(estate.state) && estate.autopilot_scope)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .map((estate) => {
      const scopeId = estate.autopilot_scope;
      return {
        estate_id: estate.id,
        estate_label: estate.label,
        priority: estate.priority,
        scope_id: scopeId,
        next_gate: estate.next_gate || null,
        jobs: countJobs(jobs, scopeId, config),
        media: countMedia(audit, scopeId),
        waterline: waterlineSummary(waterlines?.[scopeId] || null),
      };
    });
}

function leaseCommand(config, scopeId) {
  return `npm run autopilot -- next --agent ${config.default_agent} --scope ${scopeId} --capability-profile ${config.capability_profile} --limit ${config.batch_limit} --out ${config.batch_path} --prompt ${config.autopilot_prompt_path}`;
}

function commonResult(config, rows) {
  return {
    version: config.version,
    schema: config.schema,
    thesis: config.thesis,
    terminal_contract: config.terminal_contract,
    product_contract: config.product_contract,
    forbidden_default_work: config.forbidden_default_work,
    active_estates: rows,
    prompt_command: `node scripts/thesis-rails.mjs prompt --out ${config.continuation_prompt_path}`,
  };
}

export function deriveThesisContinuation({ config, registry, jobs, audit, waterlines = {}, candidateReports = {} }) {
  const errors = validateThesisRails(config);
  if (errors.length) throw new Error(`invalid thesis rails: ${errors.join("; ")}`);
  const rows = activeEstateRows({ config, registry, jobs, audit, waterlines });
  const base = commonResult(config, rows);

  const inFlight = rows.find((row) => row.jobs.in_flight > 0);
  if (inFlight) return {
    ...base,
    phase: "finish-current-cycle",
    estate_id: inFlight.estate_id,
    scope_id: inFlight.scope_id,
    reason: `${inFlight.jobs.in_flight} task(s) remain in flight`,
    next_command: `npm run waterline -- status --scope ${inFlight.scope_id}`,
    candidate: null,
  };

  const unreceipted = rows.find((row) => (row.waterline?.unreceipted_cycles || 0) > 0);
  if (unreceipted) return {
    ...base,
    phase: "finish-current-cycle",
    estate_id: unreceipted.estate_id,
    scope_id: unreceipted.scope_id,
    reason: `${unreceipted.waterline.unreceipted_cycles} cycle(s) are terminal in corpus state but lack a reviewed receipt`,
    next_command: `npm run waterline -- status --scope ${unreceipted.scope_id}`,
    candidate: null,
  };

  const mediaDebt = rows.find((row) => row.media.debt > 0 || (row.waterline?.media_debt || 0) > 0);
  if (mediaDebt) {
    const debt = Math.max(mediaDebt.media.debt, mediaDebt.waterline?.media_debt || 0);
    return {
      ...base,
      phase: "close-media-debt",
      estate_id: mediaDebt.estate_id,
      scope_id: mediaDebt.scope_id,
      reason: `${debt} exact-subject media facet(s) remain open`,
      next_command: `npm run media:audit -- status --scope ${mediaDebt.scope_id}`,
      candidate: null,
    };
  }

  for (const row of rows) {
    if (!row.jobs.queued) continue;
    if (!row.waterline) return {
      ...base,
      phase: "inspect-waterline",
      estate_id: row.estate_id,
      scope_id: row.scope_id,
      reason: "the active queue exists but no machine-readable waterline status was available",
      next_command: `npm run waterline -- status --scope ${row.scope_id}`,
      candidate: null,
    };
    if (!row.waterline.claim_allowed) return {
      ...base,
      phase: "inspect-waterline",
      estate_id: row.estate_id,
      scope_id: row.scope_id,
      reason: row.waterline.claim_reasons.length ? row.waterline.claim_reasons.join(", ") : "the rolling waterline refuses a new claim",
      next_command: `npm run waterline -- status --scope ${row.scope_id}`,
      candidate: null,
    };
    if (row.waterline.max_tasks_per_cycle != null && row.waterline.max_tasks_per_cycle < 1) return {
      ...base,
      phase: "inspect-waterline",
      estate_id: row.estate_id,
      scope_id: row.scope_id,
      reason: "the waterline reports zero task capacity",
      next_command: `npm run waterline -- status --scope ${row.scope_id}`,
      candidate: null,
    };
    const candidate = candidateRow(candidateReports[row.scope_id]);
    if (!candidate) return {
      ...base,
      phase: "inspect-capability",
      estate_id: row.estate_id,
      scope_id: row.scope_id,
      reason: `the ${config.capability_profile} capability profile produced no compatible candidate`,
      next_command: `npm run autopilot -- candidates --scope ${row.scope_id} --capability-profile ${config.capability_profile} --limit 20 --json`,
      candidate: null,
    };
    return {
      ...base,
      phase: "ready-for-one-cycle",
      estate_id: row.estate_id,
      scope_id: row.scope_id,
      reason: `${row.jobs.queued} queued task(s), zero in-flight work, zero media debt, and a claimable waterline`,
      next_command: leaseCommand(config, row.scope_id),
      candidate,
    };
  }

  const states = activeStates(config);
  const frontier = (registry?.estates || [])
    .filter((estate) => !states.has(estate.state) && estate.state !== "retired")
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0];
  if (frontier) return {
    ...base,
    phase: "advance-estate-gate",
    estate_id: frontier.id,
    scope_id: frontier.autopilot_scope || null,
    reason: frontier.next_gate || `advance ${frontier.label}`,
    next_command: "npm run corpus -- status",
    candidate: null,
  };

  return {
    ...base,
    phase: "collection-complete",
    estate_id: null,
    scope_id: null,
    reason: "no active queue or registered estate frontier remains",
    next_command: "npm run corpus -- status",
    candidate: null,
  };
}

function bulletList(values) {
  return values.map((value) => `- ${value}`).join("\n");
}

function candidateBlock(candidate) {
  if (!candidate) return "No new task may be claimed in the current phase.";
  const modes = candidate.performance_modes.length ? candidate.performance_modes.join(", ") : "unresolved";
  const sources = candidate.sources.length ? candidate.sources.map((source) => `  - ${source}`).join("\n") : "  - none recorded";
  return `Exact next candidate:\n\n- task: \`${candidate.task_id}\`\n- performer: ${candidate.performer}\n- character: ${candidate.character}\n- mode hints: ${modes}\n- priority: ${candidate.priority ?? "unranked"}\n- source fingerprint: \`${candidate.source_fingerprint || "missing"}\`\n- sources:\n${sources}`;
}

export function renderThesisContinuationPrompt(result, config) {
  const phaseDirections = {
    "finish-current-cycle": "Complete and receipt the already active cycle. Do not claim another task and do not reopen selection, source, modality, or media questions that the current reviewed candidate has already settled.",
    "close-media-debt": "Close the listed exact-subject media debt before any new claim. Adopt only exact character or performer evidence, or preserve an honest absence.",
    "inspect-waterline": "Pay the exact waterline blocker. Do not bypass it, weaken historical custody, or claim a different scope.",
    "inspect-capability": "Inspect the capability report. Do not lease an incompatible task, change the profile by assertion, or free-select a more interesting role.",
    "ready-for-one-cycle": "Claim exactly the candidate printed below and complete one bounded cycle end to end.",
    "advance-estate-gate": "Advance only the named estate gate. Do not activate or lease the estate until its existing adapter, preservation, certification, and review requirements pass.",
    "collection-complete": "Verify the terminal collection state and preserve it. Do not invent a new estate or product surface merely to create work.",
  };
  return `# UNDERCAST thesis continuation\n\nWork from current canonical \`main\`. Do not recap project history, reconstruct superseded transaction chains, or return a plan instead of acting. Read \`AGENTS.md\`, \`docs/THESIS-CONTINUATION.md\`, and the exact repository files named by the current operation.\n\n## Machine-selected rail\n\n- phase: \`${result.phase}\`\n- estate: \`${result.estate_id || "none"}\`\n- scope: \`${result.scope_id || "none"}\`\n- reason: ${result.reason}\n- next command: \`${result.next_command}\`\n\n${phaseDirections[result.phase] || "Follow the exact machine-selected operation."}\n\n${candidateBlock(result.candidate)}\n\n## Product throughline\n\nUNDERCAST is a field index of real performers who disappear under a designed face, prosthetics, a mask, a creature suit, motion capture, or an unseen voice. Every canonical increment must improve the character-to-performer reveal, its exact evidence, its separate character and performer media, or the source-backed creative labor behind it. Maker attribution may remain explicitly unresolved and must never block an otherwise complete card.\n\n## Execution rail\n\n1. Execute one operation only. A cycle contains at most one task.\n2. Reuse the current Autopilot, corpus, media, waterline, preservation, route, and release machinery. Repair a shared mechanism in place when a concrete gate proves it is defective.\n3. For a normal cycle, the complete topology is one candidate/product lane, one independent review, and one receipt-bearing finalizer. Do not create selector, preflight, blueprint, media-census, transition-controller, finalizer-census, observer, or cleanup-writer chains around an already selected task.\n4. Keep character media and performer media as separate evidentiary facets. Use an exact subject or an explicit honest absence. A performer portrait is not character evidence.\n5. Add maker credits and maker navigation only from exact source support. Preserve unresolved maker attribution without inference.\n6. Return to zero in-flight work, zero media debt, zero unreceipted cycles, and zero temporary cycle refs before another claim.\n7. Do not require the owner to run commands, provide files, inspect images, contact anyone, recruit a reviewer, or press continue.\n8. Temporary execution surfaces must self-delete. No transport path may enter the permanent product.\n\nDefault-forbidden work:\n${bulletList(config.forbidden_default_work)}\n\n## Terminal product\n\nThe final pull request body must name \`${config.workflow_policy.terminal_product_marker}\` and the exact canonical card, correction, media closure, source refresh, or estate gate it will produce. Report only canonical records added or corrected, exact queue movement, media and honest-absence dispositions, maker credits actually supported, receipts written, gates passed, and temporary surfaces removed.\n`;
}

function normalizePath(path) {
  return String(path || "").replaceAll("\\", "/").toLowerCase();
}

function hasAllMarkers(body, markers) {
  return markers.every((marker) => body.includes(marker));
}

export function evaluateThesisRailPullRequest({ config, changes, body = "" }) {
  const errors = validateThesisRails(config);
  if (errors.length) return { ok: false, errors, warnings: [], basis: "invalid-config", cycle_workflows: [] };
  const policy = config.workflow_policy;
  const cyclePattern = new RegExp(policy.cycle_workflow_pattern);
  const cycleWorkflows = [];
  const grandfathered = [];
  for (const change of changes || []) {
    const path = normalizePath(change.path);
    const match = path.match(cyclePattern);
    if (!match) continue;
    const cycleNumber = Number(match[1]);
    const row = { status: String(change.status || "M").toUpperCase(), path, cycle_number: cycleNumber };
    if (cycleNumber < policy.minimum_enforced_cycle) grandfathered.push(row);
    else cycleWorkflows.push(row);
  }
  if (!cycleWorkflows.length) return {
    ok: true, errors: [], warnings: grandfathered.length ? [`cycle workflow changes below cycle ${String(policy.minimum_enforced_cycle).padStart(3, "0")} are grandfathered while the current cycle finishes`] : [],
    basis: grandfathered.length ? "grandfathered-current-cycle" : "no-cycle-workflow-change",
    cycle_workflows: [],
    grandfathered_cycle_workflows: grandfathered,
  };

  const exception = hasAllMarkers(body, policy.exception_markers);
  const failures = [];
  const warnings = [];
  if (!body.includes(policy.terminal_product_marker)) failures.push(`cycle workflow PR must declare ${policy.terminal_product_marker}`);
  if (cycleWorkflows.length > policy.maximum_changed_cycle_workflows_per_pr) failures.push(`cycle workflow PR changes ${cycleWorkflows.length} workflows; maximum is ${policy.maximum_changed_cycle_workflows_per_pr}`);
  const forbidden = cycleWorkflows.filter((row) => policy.forbidden_stage_tokens.some((token) => row.path.includes(token)));
  if (forbidden.length && !exception) failures.push(`transition-only cycle machinery requires all exception markers: ${forbidden.map((row) => row.path).join(", ")}`);
  if (exception) warnings.push("thesis-rail exception invoked; the PR must retire the named shared-mechanism gap within its stated condition");
  if (!forbidden.length && cycleWorkflows.length > 1) warnings.push("multiple cycle workflows changed; the normal topology is candidate/product, independent review, and receipt-bearing finalizer only");
  return {
    ok: failures.length === 0,
    errors: failures,
    warnings,
    basis: exception ? "documented-shared-mechanism-exception" : "bounded-cycle-topology",
    cycle_workflows: cycleWorkflows,
    grandfathered_cycle_workflows: grandfathered,
  };
}
