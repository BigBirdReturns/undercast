# Clifford Number HR disciplinary-process Wave 01

The HR-selection estate explains how institutions classify people before admission. This packet adds the adjacent exertion: what happens when an institution threatens an incumbent worker's job, reputation, access, or status while preserving ambiguity about whether the transaction is formal enough to trigger safeguards.

The named public case is **Chloe Olivia Moffat**, a 26-year-old HM Treasury personal assistant who died on 20 May 2025. Public reporting from the ongoing inquest describes a surprise meeting about an anonymous complaint, senior attendance, access restriction, confidentiality instructions, refusal of a requested support person, visible distress, refusal to bound dismissal risk despite evidence that dismissal was unlikely, and a line-manager role that combined process oversight with pastoral care.

This wave does not issue the inquest conclusion, decide the allegation, diagnose Chloe, or assign legal liability or individual culpability. It records the institutional sequence and the accountability routes that remain open.

## The mechanism: formality arbitrage

```text
call the meeting informal or fact-finding
→ withhold notice, preparation, and support to avoid making it feel formal
→ impose senior attendance, serious allegations, access restrictions, secrecy, and future-investigation threat
→ employee experiences formal stakes without formal safeguards
→ every actor can later cite the preliminary stage, policy, advice, or another actor's role
```

The packet uses **formality arbitrage** as an analytical term. It means that the employer controls the procedural label while the employee absorbs the practical threat. The correct safeguard trigger is therefore severity, not nomenclature.

## Recovered sequence

1. An anonymous complaint alleged disclosure of confidential colleague information.
2. Chloe was not told in advance what the meeting concerned.
3. The meeting included her line manager and a senior Treasury official.
4. She asked to bring a friend for support and was refused.
5. Evidence at the inquest said another attendee would have made the meeting feel more formal.
6. When she asked whether she could be dismissed, the outcome was left unbounded even though dismissal was reported as unlikely.
7. Her access to the director's email and diary was temporarily removed and she was told not to discuss the matter with colleagues.
8. Witness evidence described shock, crying, and acute fear about job loss and reputation.
9. The same line-management chain expected to provide pastoral care remained embedded in the adverse process.
10. A formal-investigation letter was being drafted after she denied the allegation.
11. She died the following day.

Temporal sequence is not silently converted into a final causal finding. The inquest was still reported as ongoing on the wave date.

## Care-control collision

The source genealogy identifies the durable split inside HR: welfare language remains, while the controlling branch manages classification, risk, documentation, and institutional defensibility. This case exposes the split at the same desk.

```text
manager helps impose the adverse transaction
+
manager is designated pastoral-care owner
=
care-control collision
```

The conflict is structural even without malicious intent. A worker cannot reliably use the safety channel when that channel is attached to the authority producing the threat.

## Why accountability disappears

The packet does not claim that no one will ever face accountability. It records why that result is structurally easy:

- the coroner's inquest is fact-finding and does not assign blame or liability;
- employment-relations guidance can define good practice without adjudicating the individual case;
- health-and-safety enforcement generally looks for wider organizational failure rather than an individual stress case;
- the employer can convert the event into training and procedure change without publicly naming who owned the original decisions.

Each forum can be acting within its proper scope while the combined architecture leaves the decision chain unresolved. That is an accountability-routing failure, not proof that any one forum is illegitimate.

## Adverse employment process receipt

The proposed receipt contains twelve states:

```text
complaint received
→ allegation triaged
→ severity assessed
→ process classified
→ notice delivered
→ support arranged
→ interim measures imposed
→ welfare risk assessed
→ meeting conducted
→ immediate safety handoff
→ decision or investigation notice issued
→ process reconciled
```

Eleven controls remain unadopted. The central rule is a severity-equivalence trigger: when at least three formal-threat indicators are present, the full safeguard set applies regardless of whether the meeting is called informal, exploratory, preliminary, or fact-finding.

The controls require advance notice, a realistic outcome range, a companion or suitable support person, an independent welfare owner, a confidentiality carve-out for protected support, a receipt for interim restrictions, an acute-distress stop and overnight handoff, anonymous-complaint provenance, named decision authorship, and later reconciliation.

## Hard refusals

This packet refuses to infer:

- that Chloe was weak or incapable of ordinary workplace pressure;
- that the allegation was true or false;
- that a statutory accompaniment right necessarily applied at that meeting;
- that any named person caused the death or is professionally or legally culpable;
- that the coroner has issued a final conclusion;
- that every informal investigation or confidentiality instruction is illegitimate;
- that later training proves the original process safe, lawful, or complete.

## Run

```bash
node --check scripts/clifford-number-hr-disciplinary.mjs
node --check test/clifford-number-hr-disciplinary-fixtures.mjs
node scripts/clifford-number-hr-disciplinary.mjs --write
node scripts/clifford-number-hr-disciplinary.mjs --check
node test/clifford-number-hr-disciplinary-fixtures.mjs
```

## Interpretive law

An informal label is not an informal effect. Confidentiality is not isolation authority. Pastoral care is not independent when its owner is embedded in the adverse process. Refusing to predict an outcome is not neutral when the institution knows a catastrophic outcome is unlikely but leaves it unbounded. Training is not causal custody. Stress is not weakness. A coroner's fact-finding function is not an individual accountability ruling. Missing sanctions are not proof of missing institutional failure.
