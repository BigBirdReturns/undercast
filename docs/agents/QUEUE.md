# UnderCast work queue

One row = one deliverable. Claim before work: handle + date in `owner`,
`state` → `claimed`, commit that edit first. Rows derive only from
HANDOFF.md; the standing disciplines there (never invent a fact to satisfy a
schema; floors in `data/quality-baseline.json` do not relax) bind every row.

| id | task | owner | lane | state | evidence when done | note |
|----|------|-------|------|-------|--------------------|------|
| UC-MEDIA-AUDIT-1 | Exact-subject media audit of the Trek portrait batch: Memory Alpha performer pages carry in-character photos, so verify each fetched portrait depicts the intended subject before portraits are trusted | — | driver | open | Audit journal (per-card verdict + basis) committed under `data/journal/`; disqualified portraits nulled with ledger rows; no floor relaxed | HANDOFF.md PR #56 lane. The 4 caught cases were only the byte-identical ones. PR #55 merge remains the owner's routing decision and is not this row. |
