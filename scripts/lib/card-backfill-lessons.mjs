import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function fail(message) {
  throw new Error(`card-backfill lessons: ${message}`);
}

export function jsonPointerGet(value, pointer) {
  if (pointer === "") return value;
  if (!String(pointer).startsWith("/")) fail(`invalid JSON pointer ${JSON.stringify(pointer)}`);
  return String(pointer).slice(1).split("/").reduce((current, token) => {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || current === undefined || !(key in Object(current))) fail(`JSON pointer ${pointer} is missing segment ${key}`);
    return current[key];
  }, value);
}

export function validateContractStructure(contract, { runtimePolicy = null } = {}) {
  if (contract?.version !== 1 || contract?.lane !== "card-backfill-lessons-as-code") fail("invalid contract identity");
  if (contract?.invariants?.canonical_mutation !== false) fail("contract canonical mutation drift");

  const lessons = Array.isArray(contract.lessons) ? contract.lessons : [];
  if (!lessons.length) fail("lesson registry is empty");
  const lessonIds = lessons.map((lesson) => lesson.id);
  const uniqueLessonIds = sortedUnique(lessonIds);
  if (uniqueLessonIds.length !== lessonIds.length) fail("duplicate lesson id");
  for (const lesson of lessons) {
    if (!/^CBL-\d{3}$/.test(String(lesson.id || ""))) fail(`invalid lesson id ${JSON.stringify(lesson.id)}`);
    if (!lesson.title || !lesson.rule || !lesson.cultivation) fail(`lesson ${lesson.id} is missing title, rule, or cultivation`);
    if (!Number.isInteger(lesson.introduced_in_version) || lesson.introduced_in_version < 1) fail(`lesson ${lesson.id} has invalid introduction version`);
    if (lesson.status === "active" && lesson.mandatory === true && !(lesson.enforcement || []).length) fail(`active lesson ${lesson.id} has no enforcement`);
  }

  const mandatoryIds = sortedUnique(lessons.filter((lesson) => lesson.status === "active" && lesson.mandatory === true).map((lesson) => lesson.id));
  const declaredMandatory = sortedUnique(contract.mandatory_lesson_ids || []);
  if (!sameArray(mandatoryIds, declaredMandatory)) fail(`mandatory lesson set drift: derived ${mandatoryIds.join(",")} vs declared ${declaredMandatory.join(",")}`);
  const lessonsDigest = sha256(JSON.stringify(mandatoryIds));
  if (contract.lessons_contract_sha256 !== lessonsDigest) fail(`lesson digest drift: expected ${lessonsDigest}, got ${contract.lessons_contract_sha256}`);

  const policies = Array.isArray(contract.policies) ? contract.policies : [];
  if (!policies.length) fail("policy registry is empty");
  const policyById = new Map();
  for (const policy of policies) {
    if (!policy.policy_id || policyById.has(policy.policy_id)) fail(`duplicate or missing policy id ${JSON.stringify(policy.policy_id)}`);
    if (!Number.isInteger(policy.version) || policy.version < 1) fail(`policy ${policy.policy_id} has invalid version`);
    if (!Number.isInteger(policy.revision) || policy.revision < 0) fail(`policy ${policy.policy_id} has invalid revision`);
    policyById.set(policy.policy_id, policy);
  }
  const activePolicies = policies.filter((policy) => policy.status === "active");
  if (activePolicies.length !== 1) fail(`expected exactly one active policy, found ${activePolicies.length}`);
  const active = activePolicies[0];
  if (active.policy_id !== contract.active_policy_id) fail(`active policy drift: ${active.policy_id} vs ${contract.active_policy_id}`);

  for (const policy of policies) {
    const seen = new Set([policy.policy_id]);
    let cursor = policy;
    while (cursor.parent_policy_id) {
      const parent = policyById.get(cursor.parent_policy_id);
      if (!parent) fail(`policy ${cursor.policy_id} references unknown parent ${cursor.parent_policy_id}`);
      if (seen.has(parent.policy_id)) fail(`policy lineage cycle at ${parent.policy_id}`);
      seen.add(parent.policy_id);
      if (parent.version > cursor.version) fail(`policy ${cursor.policy_id} regresses below parent version ${parent.version}`);
      const parentLessons = new Set(parent.inherited_lesson_ids || []);
      const childLessons = new Set(cursor.inherited_lesson_ids || []);
      for (const id of parentLessons) if (!childLessons.has(id)) fail(`policy ${cursor.policy_id} dropped inherited lesson ${id}`);
      cursor = parent;
    }

    const expected = sortedUnique(lessons.filter((lesson) => lesson.status === "active" && lesson.mandatory === true && lesson.introduced_in_version <= policy.version).map((lesson) => lesson.id));
    const inherited = sortedUnique(policy.inherited_lesson_ids || []);
    if (!sameArray(expected, inherited)) fail(`policy ${policy.policy_id} inheritance drift: expected ${expected.join(",")}, got ${inherited.join(",")}`);
  }

  const activeInherited = sortedUnique(active.inherited_lesson_ids || []);
  if (!sameArray(mandatoryIds, activeInherited)) fail(`active policy ${active.policy_id} omits mandatory lessons`);
  if (active.lessons_contract_sha256 !== lessonsDigest) fail(`active policy lesson digest drift`);

  if (runtimePolicy) {
    const fields = ["policy_id", "parent_policy_id", "version", "revision", "lessons_contract_sha256"];
    for (const field of fields) if (runtimePolicy[field] !== active[field]) fail(`runtime policy ${field} drift: ${JSON.stringify(runtimePolicy[field])} vs ${JSON.stringify(active[field])}`);
    const runtimeLessons = sortedUnique(runtimePolicy.inherited_lesson_ids || []);
    if (!sameArray(runtimeLessons, mandatoryIds)) fail(`runtime policy omits mandatory lesson inheritance`);
    if (runtimePolicy.canonical_mutation !== false) fail("runtime policy canonical mutation drift");
  }

  return {
    lesson_count: lessons.length,
    mandatory_lesson_count: mandatoryIds.length,
    mandatory_lesson_ids: mandatoryIds,
    lessons_contract_sha256: lessonsDigest,
    policy_count: policies.length,
    active_policy: {
      policy_id: active.policy_id,
      parent_policy_id: active.parent_policy_id,
      version: active.version,
      revision: active.revision,
      inherited_lesson_count: activeInherited.length,
    },
  };
}

async function readUtf8(path) {
  return readFile(path, "utf8");
}

async function requireFile(path) {
  const info = await stat(path);
  if (!info.isFile()) fail(`enforcement path is not a file: ${path}`);
}

export async function validateEnforcement(root, contract) {
  const results = [];
  for (const lesson of contract.lessons || []) {
    if (lesson.status !== "active" || lesson.mandatory !== true) continue;
    const guards = lesson.enforcement || [];
    if (!guards.length) fail(`active lesson ${lesson.id} has no enforcement guards`);
    for (const [index, guard] of guards.entries()) {
      const path = resolve(root, guard.path || "");
      await requireFile(path);
      if (guard.kind === "contains") {
        const text = await readUtf8(path);
        for (const needle of guard.all || []) if (!text.includes(needle)) fail(`${lesson.id} guard ${index + 1} missing ${JSON.stringify(needle)} in ${guard.path}`);
      } else if (guard.kind === "json-equals") {
        const parsed = JSON.parse(await readUtf8(path));
        const actual = jsonPointerGet(parsed, guard.pointer);
        if (canonicalJson(actual) !== canonicalJson(guard.value)) fail(`${lesson.id} guard ${index + 1} expected ${guard.pointer}=${canonicalJson(guard.value)} in ${guard.path}, got ${canonicalJson(actual)}`);
      } else if (guard.kind === "exists") {
        // requireFile above is the assertion.
      } else {
        fail(`${lesson.id} guard ${index + 1} has unsupported kind ${JSON.stringify(guard.kind)}`);
      }
      results.push({ lesson_id: lesson.id, guard: index + 1, kind: guard.kind, path: guard.path, status: "pass" });
    }
  }
  return results;
}

export async function readLessonsContract(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function validateLessonsContract({ root = process.cwd(), contractPath = ".github/CARD-BACKFILL-LESSONS.json", runtimePolicy = null, checkEnforcement = true } = {}) {
  const absoluteContract = resolve(root, contractPath);
  const contract = await readLessonsContract(absoluteContract);
  const structure = validateContractStructure(contract, { runtimePolicy });
  const enforcement = checkEnforcement ? await validateEnforcement(root, contract) : [];
  return {
    version: 1,
    lane: "card-backfill-lessons-validation",
    contract_path: contractPath,
    ...structure,
    enforcement_guard_count: enforcement.length,
    enforcement,
    canonical_mutation: false,
  };
}
