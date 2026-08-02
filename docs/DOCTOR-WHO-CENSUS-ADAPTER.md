# Doctor Who census adapter

The Doctor Who estate uses a source-specific producer because Tardis Wiki serializes performer names differently from the link-heavy sources handled by the shared census crawler. Exact actor names are usually plain text inside individual infobox fields. Treating those values as generic prose would be unsafe; refusing all plain text leaves the complete estate unresolved. The adapter therefore admits plain text only inside a closed performer-field set and retains every other source value outside performer custody.

## Source contract

The producer reads the Daleks, Cybermen, Sontarans, and Ice Warriors category denominators from Tardis Wiki. Category membership is discovery evidence only. A page becomes a target role when its numbered `species` fields establish the relevant target identity, or when species is absent and the exact page title itself names the target class. Explicit non-target species are classified out of scope. Missing target identity remains unresolved.

Trusted performer parameters are limited to `actor`, `actors`, `performer`, `performers`, `played by`, `portrayed by`, `suit actor`, `main actor`, `voice actor`, and `main voice actor`. Plain-text values must resolve to person-shaped names and reject unknown, uncredited, numeric, template, and organization-shaped values. Any non-empty trusted field that cannot be parsed stops publication rather than silently disappearing.

## Performance-mode custody

An explicit voice-actor field maps to `voice`. An explicit suit-actor field maps to `physical-prosthetic`. A generic actor field establishes the performer-role join but does not establish which designed form, incarnation, suit, archive reuse, or physical-versus-voice mode the source means, so its performance mode remains `unresolved`. This preserves useful source evidence without manufacturing a stronger claim.

## Current-source receipt

The first current-source execution under this contract ran against exact main `af5289fdf1a6945e996d196de334072ce7fe3662` in workflow run `30734448125`. It published product head `a28957a024aa3b1324c27c04adeb51df6bf7545d` after the complete 26-step repository and rendered-browser gate passed in 64 seconds. Artifact `8829089607` carries digest `sha256:2f3da55e60d1e82f02aa51ed55960c6a0cea70efaddcf29cdfceea3a40778f16`.

The live denominator contained 1,560 exact observations over 1,550 unique source revisions. The adapter classified 298 pages as credited, 18 as explicitly out of scope, and 1,244 as unresolved. It recovered 316 exact performer-role credits across 110 performers. Of those credits, 225 came from explicit voice fields and 91 retained unresolved performance mode because their generic actor fields did not establish the designed-form mechanism. Target identity came from explicit species fields for 295 credited pages and exact target-bearing titles for three. No non-empty trusted performer field was silently rejected.

The refreshed Doctor Who slice remains collection debt rather than wall coverage. All 316 recovered roles are absent from the current canonical wall. Certification, estate activation, Luna leasing, and canonical record creation remain separate transactions.

## Operating sequence

```text
current category census
→ exact page and revision capture
→ target-identity classification
→ closed-field performer extraction
→ explicit unresolved and out-of-scope dispositions
→ deterministic projections
→ complete repository and rendered-browser smoke
→ separate second-desk certification or blocked ruling
```

Registration, source refresh, and a successful product gate do not activate the Doctor Who estate or issue a Luna lease. Certification remains a separate transaction, and activation remains subject to the one-estate operating policy.

## Commands

```text
node scripts/census-doctor-who-fixtures.mjs
CONTACT=undercast-doctor-who node scripts/census-doctor-who.mjs
node scripts/census-adapter.mjs write
node scripts/census-adapter.mjs check
```

The producer can also replay an independently preserved source bag with `--source-bag <bag-root>`. The same target-identity and performer rules apply to live and preserved sources.
