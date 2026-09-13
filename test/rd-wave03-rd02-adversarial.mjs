#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROOT, loadProtocol, validateProtocol } from "../scripts/rd-wave03-rd02-validate.mjs";

const EXPECTED_LANE = "RD-02";
const EXPECTED_REFUSALS = 36;

function clone(value) {
  return structuredClone(value);
}

function setHash(seed) {
  return seed.repeat(64).slice(0, 64);
}

const core = [
  ['additional root property', p => { p.unexpected = true; }],
  ['schema version drift', p => { p.schema_version = 2; }],
  ['wave identity drift', p => { p.wave_id = 'RD-W04'; }],
  ['lane identity drift', p => { p.lane_id = 'RD-99'; }],
  ['empty title', p => { p.title = ''; }],
  ['status promotion', p => { p.status = 'executed'; }],
  ['path denominator shrink', p => { p.permanent_paths.pop(); }],
  ['unit count inflation', p => { p.frozen_units.count += 1; }],
  ['unit denominator shrink', p => { p.frozen_units.ids.pop(); }],
  ['duplicate unit', p => { p.frozen_units.ids[p.frozen_units.ids.length - 1] = p.frozen_units.ids[0]; }],
  ['field count inflation', p => { p.matrix.field_count += 1; }],
  ['matrix cell inflation', p => { p.matrix.required_cells += 1; }],
  ['matrix cell hash drift', p => { p.matrix.cell_ids_sha256 = setHash('0'); }],
  ['matrix mode drift', p => { p.matrix.contract_mode = p.matrix.contract_mode === 'separate_immutable_input' ? 'embedded_immutable_input' : 'separate_immutable_input'; }],
  ['matrix path drift', p => { p.matrix.contract_path = 'data/unknown-matrix.json'; }],
  ['matrix byte hash drift', p => { p.matrix.contract_sha256 = setHash('1'); }],
  ['embedded field drift', p => { p.matrix.embedded_field_ids = Array.isArray(p.matrix.embedded_field_ids) ? p.matrix.embedded_field_ids.slice(0, -1) : []; }],
  ['official route count inflation', p => { p.routes.official_count += 1; }],
  ['candidate route count inflation', p => { p.routes.candidate_count += 1; }],
  ['total route count inflation', p => { p.routes.total_count += 1; }],
  ['official route removal', p => { p.routes.official.pop(); }],
  ['duplicate official route id', p => { p.routes.official[1].route_id = p.routes.official[0].route_id; }],
  ['non-HTTPS official route', p => { p.routes.official[0].url = 'http://example.invalid/'; }],
  ['unknown official route cell', p => { p.routes.official[0].cell_id = `${EXPECTED_LANE}:UNKNOWN:UNKNOWN`; }],
  ['candidate take inflation', p => { p.routes.candidate_family.take += 1; }],
  ['non-HTTPS candidate base', p => { p.routes.candidate_family.base_url = 'http://search.usa.gov/search'; }],
  ['candidate variant removal', p => { p.routes.candidate_family.variants = []; }],
  ['expanded route-id hash drift', p => { p.routes.expanded_route_ids_sha256 = setHash('2'); }],
  ['expanded route-URL hash drift', p => { p.routes.expanded_route_urls_sha256 = setHash('3'); }],
  ['method widened', p => { p.request_policy.method = 'POST'; }],
  ['retry enabled', p => { p.request_policy.maximum_attempts = 2; }],
  ['timeout widened', p => { p.request_policy.timeout_ms = 45001; }],
  ['body bound widened', p => { p.request_policy.maximum_body_bytes = 5242881; }],
  ['concurrency widened', p => { p.request_policy.concurrency = 3; }],
  ['follow-up spawning enabled', p => { p.request_policy.result_spawned_followups = 1; }],
  ['automatic admission enabled', p => { p.admission.automatic_admission = true; }]
];

function rd01Extensions(protocol) {
  const extra = [];
  protocol.permanent_paths.forEach((_, index) => {
    extra.push([`transport-like path ${index + 1}`, p => { p.permanent_paths[index] = `tmp/illegal-${index + 1}.json`; }]);
  });
  protocol.admission.required_bindings.forEach((_, index) => {
    extra.push([`required binding removal ${index + 1}`, p => { p.admission.required_bindings.splice(index, 1); }]);
  });
  extra.push(
    ['outside-human dependency enabled', p => { p.authority.outside_human_dependency = true; }],
    ['external contact added', p => { p.authority.external_contacts = 1; }],
    ['external review added', p => { p.authority.external_reviews = 1; }],
    ['publication effect added', p => { p.authority.publication_effect = 'candidate'; }],
    ['adoption effect added', p => { p.authority.adoption_effect = 'candidate'; }],
    ['graph effect added', p => { p.authority.graph_effect = 'candidate'; }],
    ['class closure added', p => { p.closure.classes_closed = 1; }],
    ['intake closure enabled', p => { p.closure.allow_at_intake = true; }],
    ['closure law removed', p => { p.closure.law = ''; }],
    ['candidate affiliate removed', p => { p.routes.candidate_family.affiliate = ''; }],
    ['candidate site filter removed', p => { p.routes.candidate_family.site_filter = ''; }],
    ['candidate query prefix removed', p => { p.routes.candidate_family.query_prefix = ''; }],
    ['candidate route prefix removed', p => { p.routes.candidate_family.route_id_prefix = ''; }],
    ['candidate order changed', p => { p.routes.candidate_family.order = 'result_driven'; }]
  );
  protocol.frozen_units.ids.forEach((_, index) => {
    extra.push([`empty frozen unit ${index + 1}`, p => { p.frozen_units.ids[index] = ''; }]);
  });
  for (let index = 0; index < protocol.matrix.field_count; index += 1) {
    extra.push([`field-cell hash perturbation ${index + 1}`, p => { p.matrix.cell_ids_sha256 = String(index + 4).repeat(64).slice(0, 64); }]);
  }
  protocol.routes.official.forEach((_, index) => {
    extra.push([`empty official route id ${index + 1}`, p => { p.routes.official[index].route_id = ''; }]);
    extra.push([`insecure official route ${index + 1}`, p => { p.routes.official[index].url = `http://example.invalid/${index + 1}`; }]);
  });
  ['method','maximum_attempts','timeout_ms','maximum_body_bytes'].forEach(key => {
    extra.push([`request policy property removal ${key}`, p => { delete p.request_policy[key]; }]);
  });
  extra.push(
    ['candidate result promoted to evidence', p => { p.admission.candidate_result_is_evidence = true; }],
    ['exact capture disabled', p => { p.admission.exact_capture_required = false; }],
    ['required binding reordered', p => { p.admission.required_bindings.reverse(); }]
  );
  return extra;
}

function run() {
  const protocol = loadProtocol(DEFAULT_ROOT);
  const cases = [...core];
  if (EXPECTED_REFUSALS === 87) cases.push(...rd01Extensions(protocol));
  if (cases.length !== EXPECTED_REFUSALS) throw new Error(`fixture construction produced ${cases.length}, expected ${EXPECTED_REFUSALS}`);

  const failures = [];
  for (const [name, mutate] of cases) {
    const candidate = clone(protocol);
    mutate(candidate);
    try {
      validateProtocol(candidate, { root: DEFAULT_ROOT });
      failures.push(name);
    } catch {
      // expected refusal
    }
  }
  if (failures.length > 0) throw new Error(`accepted adversarial mutations: ${failures.join(', ')}`);
  console.log(`${EXPECTED_LANE} adversarial intake: ${cases.length} PASS`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    console.error(`${EXPECTED_LANE} adversarial intake: ${error.message}`);
    process.exit(1);
  }
}
