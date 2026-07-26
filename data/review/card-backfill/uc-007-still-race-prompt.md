Rank a fixed set of image candidates for one real UnderCast card facet.

Target:
- wall_id: UC-007
- side: still
- expected_subject: The Faun & the Pale Man
- performer: Doug Jones
- production: Pan's Labyrinth (2006)
- current facet: missing
- output is candidate-only; it does not certify or apply repository state

Acceptance priorities, in order:
1. Exact visible coverage of the named character role or roles.
2. A durable source page that identifies the production/performer and a traceable asset URL.
3. Card legibility at a landscape crop.
4. Prefer a two-panel composite when two visually distinct roles are both named and no single image covers both.
5. Prefer a same-source pair when it provides exact coverage without sacrificing legibility.

The local vision labels below are independent screening observations, not claims you may rewrite:

1. CRIT-FAUN
   - source_page: https://www.criterion.com/films/28948-pan-s-labyrinth
   - asset_url: https://s3.amazonaws.com/criterion-production/carousel-files/1e37a537abc215a7b5cae0040b19c3c0.jpeg
   - source_context: Criterion film page; cast credits Doug Jones as The faun/The Pale Man
   - dimensions: 1600x900
   - sha256: 5d16e8af3e5b2052e3626942161842fc0c5e6400cfc2f43f0cf964bf43d8be9d
   - local_vision: The Faun; large curved horns and textured humanoid form; Ofelia also visible

2. CRIT-SOLDIER
   - source_page: https://www.criterion.com/films/28948-pan-s-labyrinth
   - asset_url: https://s3.amazonaws.com/criterion-production/carousel-files/24fbdbee2ddd49695973cb9010302a67.jpeg
   - source_context: Criterion film page
   - dimensions: 1600x900
   - sha256: 4fc5401ad6690a1a65b62caf247a50c452437655635b328f781494823ee6dd80
   - local_vision: neither target; military officer in uniform

3. CRIT-PALE
   - source_page: https://www.criterion.com/films/28948-pan-s-labyrinth
   - asset_url: https://s3.amazonaws.com/criterion-production/carousel-files/45433837914d296ad8c3341e15a87507.jpeg
   - source_context: Criterion film page; cast credits Doug Jones as The faun/The Pale Man
   - dimensions: 1600x900
   - sha256: d6cc5442fb3fa0952dd51085a890aa2b0275a2dcc9fa495f10be95a55c947992
   - local_vision: The Pale Man; centered full torso with eyes visible in both palms

4. CRIT-OFELIA
   - source_page: https://www.criterion.com/films/28948-pan-s-labyrinth
   - asset_url: https://s3.amazonaws.com/criterion-production/carousel-files/6c1ab928a7febf59393c7179e2abfbf9.jpeg
   - source_context: Criterion film page
   - dimensions: 1600x900
   - sha256: db700b95b7935233bef89d573dcebcb920eb198a8834774ff918b579fb3633a1
   - local_vision: neither target; Ofelia alone in a root-filled chamber

5. SYFY-PALE
   - source_page: https://www.syfy.com/syfy-wire/i-trapped-the-devil-trailer-pans-labyrinth-book-midsommar-release-date
   - asset_url: https://www.syfy.com/sites/syfy/files/2019/04/doug_jones_in_pans_labyrinth.jpg
   - source_context: SYFY Wire page labels the image "doug jones in pan's labyrinth" and credits New Line Cinema
   - dimensions: 1490x1000
   - sha256: 9d71dd1f0d0075131f4148f291af62b25323d4c806d56a073f6be1a9bed38cc1
   - local_vision: The Pale Man; tight face-and-hands crop with eyes visible in both palms

Return only one JSON object with exactly these keys:
{
  "wall_id": "UC-007",
  "side": "still",
  "decision": "single" | "two-panel-composite" | "defer",
  "selected_ids": ["candidate id"],
  "ranking": [
    {"id": "candidate id", "score": 0, "reason": "short evidence-based reason"}
  ],
  "source_rationale": "short explanation",
  "risks": ["specific unresolved risk"],
  "certification": "candidate-only"
}

Include every candidate exactly once in ranking, sorted by descending integer score.
For "single", selected_ids must contain the top-ranked id.
For "two-panel-composite", selected_ids must contain exactly the top two ids.
For "defer", selected_ids must be empty.
