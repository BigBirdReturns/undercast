from pathlib import Path

for name in ['tests/rendered/site.spec.mjs', 'docs/FULL-SITE-SWEEP.md']:
    path = Path(name)
    path.write_text(path.read_text('utf-8').rstrip() + '\n', encoding='utf-8')

print('normalized permanent sweep output')
