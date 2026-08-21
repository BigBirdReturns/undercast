from pathlib import Path

source_path = Path(__file__).with_name("lorot-media-prepare-v1.py")
source = source_path.read_text()
needle = "portrait_identity = f\"{portrait_page.get('title', '')} {portrait_description}\".lower()"
replacement = "portrait_identity = f\"{PORTRAIT_TITLE} {portrait_page.get('title', '')} {portrait_description}\".lower()"
if source.count(needle) != 1:
    raise SystemExit("Lorot portrait-identity patch cardinality drifted")
patched = source.replace(needle, replacement)
exec(compile(patched, str(source_path), "exec"), {"__name__": "__main__", "__file__": str(source_path)})
