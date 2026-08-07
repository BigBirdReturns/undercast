#!/usr/bin/env bash
set -euo pipefail
set -euo pipefail
review="$(find "$OUT/review" -type f -name independent-media-review.json -print -quit)"
publication="$(find "$OUT/observer" -type f -name publication-receipt.json -print -quit)"
test -n "$review" -a -n "$publication"
test "$(sha256sum "$review" | awk '{print $1}')" = 39140972d669d408ebc3022d4dc329e0039dd67f252055500ded8d26c5c2edb8
test "$(sha256sum "$publication" | awk '{print $1}')" = 8e3f7adb78015a0d4ad4219247d30f2950d15ad80416f488986f36ecbb9ac1bb
REVIEW="$review" PUBLICATION="$publication" python3 - <<'PY'
import hashlib, json, os, pathlib
review_path=pathlib.Path(os.environ['REVIEW'])
review=json.loads(review_path.read_text()); r=review.pop('receipt_sha256')
assert hashlib.sha256((json.dumps(review,indent=2,sort_keys=True)+'\n').encode()).hexdigest()==r=='793d6245bb2da9963919878e8a3f748cc9171d3afeba00c8f4eed6752825b925'
assert review['verdict']=='approved-for-separate-cycle-candidate'
assert review['task']=={'id':'ap_469d79ea29fd7f877395d20f','performance_mode':'voice','performer':'Dan Starkey','role':'Kreg'}
assert review['media']['sha256']=='5d19f72cbe08648568c84469287dfcd14a9c0789156cd3d740edf4c1c5bb0622'
assert review['media']['status']=='verified' and review['portrait']['status']=='absent'
assert review['source']['revision']==3851642 and review['source']['page_id']==300765
publication_path=pathlib.Path(os.environ['PUBLICATION'])
publication=json.loads(publication_path.read_text()); p=publication.pop('receipt_sha256')
assert hashlib.sha256((json.dumps(publication,indent=2,sort_keys=True)+'\n').encode()).hexdigest()==p=='cbb80557f90bb61bcbc02fbbe75226b61c7a5f89714c802e8edf5d5db0cd699d'
assert publication['asset']['id']==504051495
assert publication['asset']['sha256']=='5d19f72cbe08648568c84469287dfcd14a9c0789156cd3d740edf4c1c5bb0622'
assert publication['boundary']['release_asset_published'] is True
assert publication['boundary']['corpus_mutated'] is False
PY
served="$OUT/uc-1353-still-served.jpg"
curl --fail --location --silent --show-error \
  https://github.com/BigBirdReturns/undercast/releases/download/media-0003/uc-1353-still-5d19f72c.jpg \
  -o "$served"
test "$(wc -c < "$served")" = "67113"
test "$(sha256sum "$served" | awk '{print $1}')" = 5d19f72cbe08648568c84469287dfcd14a9c0789156cd3d740edf4c1c5bb0622
