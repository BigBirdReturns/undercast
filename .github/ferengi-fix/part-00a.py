# Keep the canonical provenance mirror aligned with corrected shelf identity.
sources_path = ROOT / 'data/SOURCES.json'
sources = json.loads(sources_path.read_text())
sources_by_id = {row['id']: row for row in sources}
for ident in ['UC-678', 'UC-679']:
    if ident not in sources_by_id:
        raise SystemExit(f'missing SOURCES row {ident}')
    sources_by_id[ident]['universe'] = 'Star Trek'
sources_path.write_text(json.dumps(sources, ensure_ascii=False, indent=1) + '\n')
