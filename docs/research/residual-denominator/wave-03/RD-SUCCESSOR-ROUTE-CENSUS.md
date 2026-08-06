# RD-W03 · Offline successor-route census

## Result

The nine immutable exact-capture bodies were parsed without network access after all nine failed the complete five-binding admission law.

```text
retained bodies:                         9
body bytes:                      2,424,781
anchor observations:                   785
per-object unique URL observations:    686
global unique URLs:                    438
fixed successor candidates:             28
mapping-required candidates:            26
zero-direct-successor gaps:               4
live source requests:                     0
evidence admissions:                      0
chronology resolutions:                   0
classes closed:                           0
```

Candidate classes:

```text
NatSec edition pages:                     3
NatSec report PDF:                         1
SBA SBIC directory:                        1
ACES member profiles:                     17
ACES meeting details:                      2
ACES subcommittee pages:                   3
ACES charter PDF:                          1
```

## Remediation split

Four refused objects are blocked by missing frozen ID mappings: one opaque NatSec edition object and three ACES member objects. Five refused objects are wrong at the substantive source level: one generic SBA page, two California pages for Alabama cells, and two National Science Board pages for ACES cells.

No ordinal join is allowed. Display order cannot map `EDITION-01..03` to years or `ACES-MEMBER-01..17` to names.

Four refused cells have no direct successor link in their retained body:

```text
RD-04:AL:hearing
RD-04:AL:stay
RD-05:ACES-MEMBER-01:recommendation
RD-05:ACES-MEMBER-01:disposition
```

## Deterministic proof

The committed ledger is compact: each body retains exact custody, counts, and the SHA-256 of its complete URL+text-deduplicated anchor observation set. Each of the 28 candidates separately binds its exact source body, anchor ordinal, text, original href, absolute URL, normalized URL, target family, and candidate-only reason. The verifier regenerates the complete 785-row anchor census from the immutable bodies and requires byte-for-byte equality with the compact ledger.

```text
object custody SHA-256:     6fc253c87deb7b419153d45f93023f13b696844e78310172af89fd0c34dab874
anchor ledger SHA-256:      862db807cdd8f9c03ca5107f87fd9a9422233ad62b359e278bbf26de96c42cdb
successor routes SHA-256:   160c0f500b7df184ab084e031704f2dead793f13807c2cbdb8cc612f72dd998f
gap register SHA-256:       87c5ed11dc133bc24532e1ab3264c2dc6b38c95d1b5edcfe43f00fc1d9c1c9ae
```

```bash
python3 scripts/rd-wave03-successor-route-census.py --check
python3 scripts/rd-wave03-successor-route-census.py --verify-inputs --capture-root /path/to/capture/objects
python3 test/rd-wave03-successor-route-census-adversarial.py
```

## Authority boundary

This package performs no request and authorizes no request. A later separately authorized transaction may execute the fixed routes with GET, one attempt, 45-second timeout, 5 MiB limit, concurrency two, no automatic second pass, and no result-spawned follow-up. A successful response still cannot become evidence without the complete official-object, unit-identity, event-class, chronology, and byte binding set.
