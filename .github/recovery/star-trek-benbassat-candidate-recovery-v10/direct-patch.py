from pathlib import Path
import os

lifecycle=Path(os.environ['LIFECYCLE'])
text=lifecycle.read_text()
old='''    lease_id = current.get("outcome", {}).get("media_review", {}).get("lease_id")
    if lease_id != EXPECTED_LEASE:
        raise SystemExit(f"resolved media review lease drifted: {lease_id}")
'''
new=old+'''    precomplete_refresh = read_json(OUT / "precomplete-census-refresh.json")
    terminal_refresh = read_json(OUT / "terminal-census-refresh.json")
    if precomplete_refresh.get("success") is not True or precomplete_refresh.get("mode") not in {"live-refresh", "frozen-project-only"}:
        raise SystemExit("precomplete census refresh receipt is not admissible")
    if precomplete_refresh.get("mode") == "frozen-project-only" and (precomplete_refresh.get("fallback_reason") != "recognized-source-unavailability" or precomplete_refresh.get("source_snapshot_unchanged") is not True):
        raise SystemExit("frozen census fallback did not preserve the source snapshot")
    if terminal_refresh.get("success") is not True or terminal_refresh.get("mode") != "project-only" or terminal_refresh.get("source_snapshot_unchanged") is not True:
        raise SystemExit("terminal census projection receipt is not admissible")
'''
if text.count(old)!=1: raise SystemExit(f'lifecycle lease anchor count {text.count(old)}')
text=text.replace(old,new,1)
old='''        "media": {"branch": os.environ["MEDIA_BRANCH"], "receipt_sha256": media_receipt["receipt_sha256"], "facets": {"still": media_receipt["facets"]["still"], "portrait": media_receipt["facets"]["portrait"]}},
'''
new=old+'''        "projection_refresh": {"precomplete": precomplete_refresh, "terminal": terminal_refresh},
'''
if text.count(old)!=1: raise SystemExit(f'lifecycle candidate anchor count {text.count(old)}')
lifecycle.write_text(text.replace(old,new,1))

step1=Path(os.environ['STEPS_ROOT'])/'01.sh'
text=step1.read_text()
old='cp "$LIFECYCLE_SOURCE" "$LIFECYCLE"\ncp "$BATCH_SOURCE" "$BATCH"\n'
if text.count(old)!=1: raise SystemExit(f'step01 externalized-input anchor count {text.count(old)}')
step1.write_text(text.replace(old,'',1))

step3=Path(os.environ['STEPS_ROOT'])/'03.sh'
text=step3.read_text(); old='node scripts/census.mjs | tee "$OUT/precomplete-census.log"\n'; new='"$CENSUS_HELPER" precomplete live-first\n'
if text.count(old)!=1: raise SystemExit(f'step03 census anchor count {text.count(old)}')
step3.write_text(text.replace(old,new,1))

step4=Path(os.environ['STEPS_ROOT'])/'04.sh'
text=step4.read_text(); old='node scripts/census.mjs | tee "$OUT/census.log"\n'; new='"$CENSUS_HELPER" terminal project-only\n'
if text.count(old)!=1: raise SystemExit(f'step04 census anchor count {text.count(old)}')
text=text.replace(old,new,1)
anchor='''   and .publication_base.kind == "product-neutral-media-search-maintenance"
'''
addition='''   and .projection_refresh.precomplete.success == true
   and (.projection_refresh.precomplete.mode == "live-refresh" or .projection_refresh.precomplete.mode == "frozen-project-only")
   and .projection_refresh.terminal.success == true
   and .projection_refresh.terminal.mode == "project-only"
   and .projection_refresh.terminal.source_snapshot_unchanged == true
'''
if text.count(anchor)!=1: raise SystemExit(f'step04 receipt anchor count {text.count(anchor)}')
step4.write_text(text.replace(anchor,anchor+addition,1))
