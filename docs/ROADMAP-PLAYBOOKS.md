# UNDERCAST — roadmap milestone playbooks

This file is the exact build-sequence target for `data/ROADMAP.json`. Read the five-year strategy in `docs/FIVE-YEAR-PLAN.md` first. A playbook is authorized only when `npm run roadmap -- status` reports it `ready`.

Completion is recorded only in `data/ROADMAP-STATE.json` through a reviewed pull request. Machines cannot close second-desk or owner milestones.

## trusted-foundation

**Merge a trustworthy producer and certified autopilot**  
**Forecast:** 2026 H2  
**Authority:** second-desk  
**Dependencies:** none

Establish the only legal starting point: a fail-closed census producer, deterministic archive gate, certified Star Trek scope, and bounded Luna control plane merged in dependency order.

### Build sequence

1. Finish parser/fallback fixtures, network regeneration, semantic review, and full gate on PR #55.
2. Merge PR #55 first.
3. Rebase and clean PR #56; add producer certification.
4. Keep all scopes paused; certify only Star Trek from the actual regenerated corpus.
5. Run the exact-head full gate and record rollback points.

### Acceptance proof

- census fixtures pass
- named entity leaks absent after regeneration
- semantic second-desk review
- full archive/browser/DS9 gate
- zero Luna work in flight

### Do not

- hand-editing generated rows
- schema-green as semantic proof
- worker self-certification

### Outcome metrics

- `certified_scopes`
- `source_freshness_p95_days`
- `build_minutes_p95`

## star-trek-gold-shard

**Make Star Trek the evidence-complete gold shard**  
**Forecast:** 2026 H2–2027 Q1  
**Authority:** second-desk  
**Dependencies:** trusted-foundation

Prove the full recognition lifecycle on one large, adversarial corpus before breadth: discovery, eligibility research, canonical merge, exact-subject media, durable records, corrections, and honest unresolved debt.

### Build sequence

1. Compile corrected Trek coverage into the queue.
2. Run bounded priority batches.
3. Run the hash-bound `media:audit` tracker: independently review identity and presentation for every Trek image facet, replace or null negative rulings, and receipt explicit absence.
4. Record owner decision before changing shared performer-media semantics.
5. Publish honest coverage and correction surfaces.

### Acceptance proof

- all filed Trek roles have performance receipts
- Trek media audit complete
- three restart-safe Luna cycles
- coverage separates eligible/filed/blocked/excluded/unresolved

### Do not

- bulk drafting beyond review capacity
- unresolved as ineligible
- ungoverned shared performer images

### Outcome metrics

- `verified_records`
- `scope_coverage_ratio`
- `media_audit_ratio`
- `correction_escape_rate_per_1000`

## operational-reliability

**Make autonomy observable, recoverable, and cheap**  
**Forecast:** 2026 H2–2027 Q1  
**Authority:** second-desk  
**Dependencies:** trusted-foundation

Turn a working pipeline into an operating system with service levels, cost boundaries, restore drills, incident receipts, and bounded failure domains.

### Build sequence

1. Define freshness, correction, build, publication, and rights SLOs.
2. Record per-run failures, retries, costs, and throughput.
3. Document and test backup, restore, rollback, and credential recovery.
4. Add scope circuit breakers and capacity budgets.
5. Publish incident receipts.

### Acceptance proof

- fresh restore succeeds
- bad publication rollback succeeds
- build and cost baselines measured
- incident authority fixture-covered

### Do not

- silent retries
- unhashed mutable backups
- unbounded scheduled growth

### Outcome metrics

- `build_minutes_p95`
- `cost_per_verified_record_usd`
- `source_freshness_p95_days`
- `rights_response_sla_days`

## adapter-sdk-and-second-gold-shard

**Turn one-off crawlers into a certified adapter SDK**  
**Forecast:** 2027 H1  
**Authority:** second-desk  
**Dependencies:** star-trek-gold-shard, operational-reliability

Make new shows a repeatable evidence-adapter exercise rather than a bespoke corpus rewrite, then prove the contract on one second gold shard.

### Build sequence

1. Extract a closed adapter contract and adversarial fixture kit.
2. Add certification/revocation bound to producer hashes.
3. Choose a second shard by source quality, default candidate Doctor Who.
4. Run full regeneration, semantic review, Luna pilot, media audit, and correction drill.
5. Document source migration and deprecation.

### Acceptance proof

- versioned adapter contract
- second scope independently certified
- scope refresh/lease isolation
- revocation blocks new leases
- certified_scopes >= 2

### Do not

- copying Trek assumptions
- fixture-only activation
- person-shape as identity proof

### Outcome metrics

- `certified_scopes`
- `source_freshness_p95_days`
- `scope_coverage_ratio`
- `cost_per_verified_record_usd`

## public-trust-and-corrections

**Make corrections, absence, and change history part of the product**  
**Forecast:** 2027 H2  
**Authority:** second-desk  
**Dependencies:** star-trek-gold-shard, operational-reliability

Let the public challenge the archive safely and see what changed, why, and from which evidence—before introducing contributor accounts or reputation.

### Build sequence

1. Add record-specific correction intake.
2. Use append-only triage, evidence, status, and disposition.
3. Expose correction and identity history without reporter PII.
4. Measure correction and rights SLAs.
5. Publish archive health and freshness.

### Acceptance proof

- end-to-end correction drill
- median close time measured
- escape rate measured
- rights path tested
- privacy review

### Do not

- deleting history
- unsourced corrections
- accounts as review-capacity workaround

### Outcome metrics

- `correction_submissions_30d`
- `median_correction_close_days`
- `correction_escape_rate_per_1000`
- `rights_response_sla_days`

## identity-and-discovery

**Build durable person, production, and maker discovery**  
**Forecast:** 2028 H1  
**Authority:** owner  
**Dependencies:** star-trek-gold-shard, public-trust-and-corrections  
**Owner decisions:** identity-surface-model

Let visitors follow one performer across many faces, one production across its hidden cast, and one maker across design lineages without creating a second character-to-performer reveal.

### Build sequence

1. Ratify actor-filter/person-page/navigation model.
2. Normalize identities, aliases, redirects, and media ownership.
3. Generate person, production, maker, species/method projections.
4. Preserve flip and permanent-record responsibilities.
5. Add accessible/no-JS advanced discovery and measure use.

### Acceptance proof

- owner decision recorded
- identity collision fixtures
- no second reveal
- search/return metrics measured
- no-JS parity

### Do not

- fuzzy identity merges
- global nav by aspiration
- new comparison reveal

### Outcome metrics

- `successful_search_rate`
- `returning_researcher_rate`
- `external_citations_12m`

## reviewed-contributor-program

**Open evidence contribution without opening canonical writes**  
**Forecast:** 2028 H2  
**Authority:** owner  
**Dependencies:** adapter-sdk-and-second-gold-shard, public-trust-and-corrections, identity-and-discovery  
**Owner decisions:** contributor-governance  
**Triggers:** `qualified_contributor_candidates_90d gte 5`

Grow a qualified contributor network through structured proposals, transparent review, and reversible receipts while preserving accountable canonical ownership.

### Build sequence

1. Ratify roles, moderation, appeals, privacy, and write boundaries.
2. Invite repeat accurate submitters into a bounded pilot.
3. Contributors propose; reviewers decide.
4. Journal proposer, reviewer, evidence, and canonical effect.
5. Expand only within review SLO.

### Acceptance proof

- owner governance decision
- demand trigger met
- no contributor canonical writes
- review audit trail
- abuse/rights drills

### Do not

- open signup before capacity
- automatic reputation acceptance
- volume leaderboards

### Outcome metrics

- `active_contributors_90d`
- `median_correction_close_days`
- `correction_escape_rate_per_1000`
- `independent_maintainers`

## versioned-public-data-interface

**Publish stable exports, embeds, and a read-only API when demanded**  
**Forecast:** 2029 H1  
**Authority:** owner  
**Dependencies:** identity-and-discovery, reviewed-contributor-program  
**Owner decisions:** public-data-policy  
**Triggers:** `external_integration_requests_90d gte 3`

Let external publishers, researchers, and fan tools reuse durable records without scraping presentation HTML or receiving privileged canonical write access.

### Build sequence

1. Ratify licensing, attribution, rate, image, privacy, and deprecation policy.
2. Stabilize immutable static exports first.
3. Build only demonstrated read queries/API.
4. Ship provenance-preserving embeds.
5. Provide fixtures, clients, changelog, and deprecation window.

### Acceptance proof

- owner data policy
- demand trigger met
- versioned snapshot/tombstone resolution
- read-only boundary
- interface telemetry

### Do not

- unversioned endpoints
- privileged partner facts
- rights-unsafe embeds

### Outcome metrics

- `external_integration_requests_90d`
- `monthly_api_requests`
- `external_citations_12m`
- `build_minutes_p95`

## international-and-ten-scopes

**Expand internationally through certified local-source adapters**  
**Forecast:** 2029 H2  
**Authority:** second-desk  
**Dependencies:** adapter-sdk-and-second-gold-shard, reviewed-contributor-program  
**Triggers:** `certified_scopes gte 3`

Reach at least ten independently certified scopes while preserving local names, scripts, credits, source semantics, and honest unresolved identities.

### Build sequence

1. Add native-script identities, romanized aliases, and locale-aware search.
2. Require accountable source-language reviewers.
3. Prioritize strong credit sources and correction communities.
4. Certify each scope independently.
5. Publish scope-local health; reach ten through receipts, not declarations.

### Acceptance proof

- certified_scopes entry >= 3
- certified_scopes target >= 10
- Unicode identity fixtures
- language-competent reviewer per scope
- scope-local health

### Do not

- language-blind scraping
- translation confidence as review
- configured counted as certified

### Outcome metrics

- `certified_scopes`
- `census_observations`
- `scope_coverage_ratio`
- `source_freshness_p95_days`
- `active_contributors_90d`

## institutional-preservation

**Become citable, preservable infrastructure for cultural institutions**  
**Forecast:** 2030 H1  
**Authority:** owner  
**Dependencies:** versioned-public-data-interface, international-and-ten-scopes  
**Owner decisions:** partnership-and-preservation-policy  
**Triggers:** `institutional_partner_requests_12m gte 2`

Make the archive useful to museums, guilds, libraries, festivals, educators, researchers, and estates without trading away public access or evidence standards.

### Build sequence

1. Ratify non-exclusive partnership, conflict, sponsorship, embargo, and access policy.
2. Publish annual immutable corpus/software/decision snapshots.
3. Create citation guidance and stable snapshot IDs.
4. Pilot two non-exclusive institutional uses.
5. Run external-snapshot restore drills.

### Acceptance proof

- owner partnership policy
- demand trigger met
- annual snapshot restores
- citation guide
- two reviewed pilots

### Do not

- exclusive core data
- hidden sponsored curation
- institutional authority replacing evidence

### Outcome metrics

- `institutional_partner_requests_12m`
- `external_citations_12m`
- `rights_response_sla_days`
- `returning_researcher_rate`

## sustainable-governance

**Establish durable funding, release authority, and succession**  
**Forecast:** 2030 H2  
**Authority:** owner  
**Dependencies:** reviewed-contributor-program, institutional-preservation  
**Owner decisions:** sustainability-and-governance-model  
**Triggers:** `independent_maintainers gte 2`

Ensure the archive can continue through maintainer turnover, vendor changes, funding shocks, and owner absence without becoming unaccountable.

### Build sequence

1. Ratify legal/fiscal model and decision rights.
2. Publish costs, funding, conflicts, and reserve policy.
3. Separate release, certification, rights, finance, and product authority.
4. Require two maintainers to pass release/restore/incident/rights drills.
5. Document succession, escrow, vendor migration, and shutdown preservation.

### Acceptance proof

- owner governance decision
- maintainer trigger met
- role separation
- owner-unavailable drill
- financial transparency

### Do not

- token governance
- anonymous irreversible authority
- funding buys canonical control

### Outcome metrics

- `independent_maintainers`
- `cost_per_verified_record_usd`
- `rights_response_sla_days`
- `active_contributors_90d`

## stewarded-cultural-commons

**Operate as a self-renewing, evidence-first cultural commons**  
**Forecast:** 2031 H1  
**Authority:** owner  
**Dependencies:** versioned-public-data-interface, international-and-ten-scopes, institutional-preservation, sustainable-governance  
**Owner decisions:** commons-charter

Complete the five-year transition: certified adapters continuously discover work; bounded humans and agents review it; durable public records, snapshots, corrections, and governance survive any one maintainer.

### Build sequence

1. Ratify commons charter.
2. Demonstrate scheduled certified-scope refresh with bounded failure domains.
3. Publish annual trust/growth/adoption/cost/rights/debt report.
4. Maintain three release/restore stewards and vendor-independent recovery.
5. Review automation for least authority and set the next five-year roadmap.

### Acceptance proof

- commons charter
- three capable stewards
- annual report
- vendor-independent restore
- receipted five-year review

### Do not

- self-sustaining by traffic
- unbounded autonomous acceptance
- hidden unresolved debt

### Outcome metrics

- `verified_records`
- `certified_scopes`
- `external_citations_12m`
- `active_contributors_90d`
- `independent_maintainers`
- `cost_per_verified_record_usd`
- `correction_escape_rate_per_1000`
