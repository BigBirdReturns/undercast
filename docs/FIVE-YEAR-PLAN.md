# UNDERCAST — five-year operating plan, 2026–2031

This plan turns strategy into an executable dependency graph. It does not replace
the Product Constitution, Design System, GROW law, crawler contracts, or Active
decisions. Those remain binding. The roadmap answers a narrower question:

> Given the archive's current evidence and operating state, what is the next
> authorized thing to build, who may approve it, and what proof must exist before
> the following thing begins?

The machine-readable contract is `data/ROADMAP.json`; completion receipts and
measured demand live in `data/ROADMAP-STATE.json`. Exact milestone instructions
live in `docs/ROADMAP-PLAYBOOKS.md`.

```bash
npm run roadmap -- validate
npm run roadmap -- status
npm run roadmap -- next
npm run roadmap -- explain --milestone trusted-foundation
```

Agents do not choose a later milestone because it is more interesting. Dates are
forecasts. Dependencies, evidence gates, product law, and decision authority are
the actual sequence.

## North star

A durable recognition event:

1. a visitor recognizes or searches for a designed character;
2. the visitor deliberately crosses the character→performer reveal;
3. the performer, production, maker, and transformation context are accurate;
4. claim and image provenance are inspectable;
5. the durable record still resolves and remains correct when the visitor returns.

The project is not optimizing for the largest possible row count. It is
optimizing for **verified records that keep producing trustworthy recognition
moments over time**.

## The five-year shape

### 2026 H2–2027 Q1 — Prove the whole system on one gold shard

Merge the corrected producer before the autonomous control plane. Certify only
Star Trek. Drain bounded batches, verify every available image subject, expose
honest unresolved debt, and prove crash recovery, rejection, rollback, source
change, and correction paths.

The success condition is not "many Trek cards." It is that one very large,
adversarial corpus can move through discovery → reviewed eligibility → canonical
merge → exact-subject media → durable record → correction without hidden state or
invented facts.

### 2027 — Turn one success into a repeatable operating system

Define service levels, cost and freshness telemetry, backups, restore drills, and
scope-local circuit breakers. Extract a versioned adapter contract. Certify one
second gold shard from a genuinely regenerated source, not from copied Star Trek
assumptions.

Open a public correction path before opening contributor accounts. The archive
must demonstrate that it can receive disagreement, resolve it quickly, preserve
history, and learn from failures.

### 2028 — Improve discovery and form a reviewed contributor network

After the owner decides the durable identity model, build person, production,
maker, and related discovery surfaces without creating a second
character→performer reveal. Use measured search behavior to decide what earns
navigation.

Invite qualified evidence contributors only after they have demonstrated useful
correction work and review capacity exists. Contributors propose; accountable
reviewers decide. No reputation score, account role, or model output directly
writes canonical truth.

### 2029 — Become useful outside the site

When real integrations ask for it, publish stable snapshots, embeds, and a
versioned read-only interface. Keep core records and provenance public. Preserve
durable IDs, tombstones, source hashes, and deprecation windows.

Expand internationally through locally reviewable adapters, native-script names,
and source-language evidence. Ten configured scopes are meaningless; the target
is ten independently certified and observable scopes.

### 2030–2031 — Become preservable and governable beyond one owner

Publish annual immutable snapshots and citation guidance. Pilot non-exclusive
institutional use with museums, guilds, archives, libraries, festivals, educators,
and researchers. Decline arrangements that require hidden corrections,
exclusive facts, or weak rights boundaries.

Choose a sustainable legal/fiscal model only after capable maintainers and real
operating costs exist. Separate release, certification, rights, finance, and
product-law authority. By 2031, at least three stewards must be able to restore
and release the archive from open snapshots without dependence on one owner,
model provider, host, or source wiki.

## Adoption ladder

Adoption is earned in stages. Each stage has a promise and a set of things the
project deliberately refuses to build yet.

| Stage | Promise | Entry proof |
|---|---|---|
| Operator proof | One owner and reviewed agents can reproduce the archive safely. | Current starting state |
| Fan reference | Fans can find, reveal, verify, and correct a gold-shard corpus. | Star Trek gold shard complete |
| Trusted community | Corrections and change history are first-class and timely. | Public trust/corrections milestone |
| Contributor network | Qualified contributors submit structured evidence through review queues. | Contributor governance + demand |
| Partner utility | External tools can depend on stable, versioned read interfaces. | Demonstrated integration demand |
| Institutional reference | Preserved snapshots and identities are citable by cultural institutions. | Preservation and partnership gates |
| Stewarded commons | Multiple accountable maintainers can survive succession. | Commons charter + operational resilience |

Pageviews do not advance a stage. A stage advances only through a reviewed
milestone receipt in `ROADMAP-STATE.json`.

## Growth engine

Growth is a set of bounded loops, not one infinite prompt.

### Source loop

```text
discover scope
→ crawl with revision/content receipts
→ semantic producer review
→ certify adapter
→ publish coverage/unresolved debt
→ scheduled refresh
→ source change reopens affected work
```

### Canonical record loop

```text
queue exact performer-role
→ bounded Luna lease
→ draft / reject / blocked
→ grow verification
→ canonical merge or rejection receipt
→ retrieval
→ exact-subject media review or explicit absence
→ archive gate
→ resolved task
```

### Correction loop

```text
record-specific report
→ evidence triage
→ reviewed disposition
→ canonical correction / rejection / retirement
→ public change receipt
→ fixtures or producer repair when systemic
```

### Adoption loop

```text
observe repeated user/partner need
→ record aggregate demand metric
→ trigger fires
→ owner or second-desk authorization
→ smallest reversible product
→ measure trust and utility
→ expand, hold, or remove
```

The loops are coupled by backpressure. If media review, corrections, or source
certification fall behind, drafting slows or stops. Throughput never outranks the
weakest trust stage.

## Decision rights

### Machines and Luna

Machines may crawl, hash, diff, rank, lease, validate, build projections, and
prepare reversible queues. Luna may research only work in a valid lease and may
file exact-subject media observations.

Machines and Luna may not:

- certify a producer they consume;
- decide product taste or permanent navigation;
- activate a new scope without certification;
- close second-desk or owner milestones;
- approve partnerships, funding, governance, or rights policy;
- infer that unknown means absent or ineligible.

### Second desk

The second desk certifies source adapters and regenerated corpora, closes
technical/evidence milestones, and pauses unsafe automation. It must review
semantic outputs, not merely green tests.

### Owner

The owner decides scope, product identity, irreversible presentation, rights
posture, partnerships, funding, governance, and succession. An owner milestone
requires a recorded decision reference; synthesized language is never presented
as an owner quotation.

## Metric discipline

The roadmap defines metrics before it defines growth targets. A missing value is
`null`, never zero. Metrics are used for four purposes:

- **Trust:** verified records, media audit, correction escape, source freshness.
- **Utility:** successful search, return use, citations, correction demand.
- **Capacity:** build time, cost per verified record, reviewer throughput.
- **Durability:** certified scopes, capable maintainers, rights-response time,
  preserved snapshots.

Avoid vanity optimization. Traffic alone cannot justify accounts, APIs,
international expansion, or governance claims.

## Build only when a trigger fires

The roadmap contains explicit scale and demand triggers. Important examples:

- At 20 actionable corrections in 30 days, structure the correction intake.
- At 10,000 canonical records, introduce incremental static builds and explicit
  payload/search budgets.
- At 50,000 records, partition canonical snapshots and parallelize projections.
- A dedicated read service is considered only when both the corpus and real API
  demand require it.
- A contributor workflow begins only after at least five people have repeatedly
  submitted accepted evidence.
- A public API begins only after at least three credible external integration
  requests.
- Governance expands only after independent maintainers pass release and restore
  drills.

A trigger authorizes evaluation and the smallest reversible implementation. It
does not waive product, rights, evidence, or owner gates.

## Architecture through the scale curve

### Up to 10,000 records

Keep the current static-publication model. Invest in deterministic projections,
content-addressed media, stable IDs, source receipts, and browser performance.
Do not add a database server to avoid learning how the corpus behaves.

### 10,000–50,000 records

Build changed-scope/incremental projections, page-weight budgets, partitioned
search postings, and resumable media operations. Preserve a complete static
snapshot as the recovery contract.

### 50,000–100,000 records

Partition canonical snapshots by stable identity ranges, parallelize builds, and
isolate scope refreshes. Keep canonical truth auditable as files/snapshots even if
internal tooling becomes more database-like.

### Beyond 100,000 records

A dedicated read service may be warranted only when measured machine-consumer
demand also exists. Static snapshots remain the preservable baseline. The write
path remains reviewed, append-receipted, and separate from public reads.

### Beyond one million source observations

Partition manifests and make source refresh incremental. Publish annual immutable
observation and corpus snapshots so the provenance graph remains independently
restorable.

## Product sequence

The product grows in this order:

1. **Wall and deliberate flip** — the recognition moment.
2. **Permanent record** — durable evidence and citation.
3. **Coverage/corrections** — honest completeness and disagreement.
4. **Identity discovery** — one performer, many faces; productions and makers.
5. **Contributor review surfaces** — evidence proposals, not canonical editing.
6. **Exports/embeds/API** — reuse after stability and demand.
7. **Institutional citation and preservation** — annual snapshots and partnerships.

A later surface cannot steal the earlier surface's responsibility. Person pages
do not replace the flip. APIs do not become a privileged truth layer.
Institutional partnerships do not receive hidden corrections.

## Community sequence

The project begins with no general account system.

1. Offer record-specific correction and evidence submission.
2. Measure review quality and latency.
3. Identify repeat, accurate submitters.
4. Invite a small contributor cohort.
5. Assign bounded evidence tasks.
6. Separate proposer and reviewer authority.
7. Publish contribution receipts and appeals.
8. Add broader onboarding only when moderation and review SLOs remain healthy.

No direct canonical writes. No volume leaderboards. No automatic acceptance from
reputation or model confidence.

## Rights and preservation

The archive must keep image rights, factual evidence, and public access as
separate concerns.

- Every image carries origin and rights metadata.
- Exact-subject review proves identity, not reuse permission.
- Takedowns are specific, prompt, and receipted.
- A removed asset does not erase the factual record.
- Core factual exports remain public even when image fields are restricted.
- Annual snapshots include software, schemas, decisions, canonical data,
  manifests, tombstones, and restoration instructions.
- Partner access is non-exclusive and cannot suppress corrections.

## Sustainability

Do not choose a legal form or monetization model in advance of real costs and
maintainers. The default principles are:

- core archive and provenance stay free to read;
- no sale of likeness profiles or hidden enrichment data;
- no advertiser control over inclusion, correction, or ranking;
- material sponsorship and conflicts are disclosed;
- funding cannot buy canonical authority;
- reserves prioritize hosting, preservation, rights response, and maintainer
  continuity.

Possible structures—owner-led, fiscal sponsor, nonprofit, or trust—remain owner
decisions at the sustainable-governance milestone.

## Quarterly operating cadence

Every quarter:

1. Run `roadmap status` and publish the current ready/blocked milestones.
2. Update measured metrics; unknown remains null.
3. Review incidents, corrections, rights requests, source freshness, costs, and
   unresolved debt.
4. Confirm current scopes and certifications.
5. Select at most one strategic milestone per accountable review lane.
6. Reduce or pause throughput where a trust or review queue is behind.
7. Record completed milestone evidence in a reviewed PR.
8. Re-run roadmap validation and the canonical archive gate.

Every year:

- publish a state-of-the-archive report;
- snapshot the corpus and software;
- re-evaluate triggers and targets from observed demand;
- amend future milestones through review without rewriting historical receipts.

## Recording milestone completion

`data/ROADMAP-STATE.json` is append-like governance state. A completion row needs:

```json
{
  "milestone": "trusted-foundation",
  "completed_at": "2026-09-01T00:00:00Z",
  "reviewed_by": "reviewer identity",
  "reviewed_role": "second-desk",
  "evidence": [
    { "type": "pull-request", "value": "#55" },
    { "type": "pull-request", "value": "#56" },
    { "type": "workflow-run", "value": "exact successful run id" }
  ]
}
```

Owner milestones also require their named decision in `state.decisions`, with a
reference into the append-only decision log. The validator rejects:

- skipped dependencies;
- machine closure of second-desk/owner milestones;
- owner milestones without required decisions;
- unknown metrics or milestones;
- duplicate completion and decision receipts;
- cyclic or malformed roadmap dependencies.

State is updated only through a reviewed pull request. The roadmap CLI has no
command that lets an autonomous worker mark itself complete.

## Immediate next sequence

The first and only ready milestone is `trusted-foundation`.

```bash
npm run roadmap -- next --limit 1
```

Its order is binding:

1. finish PR #55's corrected producer, network regeneration, semantic review, and
   complete gate;
2. merge PR #55;
3. rebase and clean PR #56;
4. certify only Star Trek from the corrected corpus;
5. run the full gate;
6. merge PR #56;
7. record the milestone completion receipt;
8. then begin the Star Trek gold-shard and operational-reliability milestones.

Nothing in the five-year plan authorizes feeding an uncertified census to Luna,
opening every configured scope, or skipping directly to accounts, APIs,
partnerships, or governance.
