#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=.github/recovery/star-trek-maryl-cycle-v1
while read -r expected file; do
  test "$(git hash-object "$ROOT/$file")" = "$expected" || {
    printf 'Maryl helper blob drift: %s\n' "$file" >&2
    exit 1
  }
done <<'BLOBS'
c81687748218460c67bb8ac76f6d5439acd66628  part-00.mjs
bb5b3136b5b94e134769ce7999312dc24f777e0b  part-01.mjs
6258411e03e7a21e46697f8664d5871c6711a855  part-02.mjs
104e4a54e17b0a1130a36bd0f3505952924e0c40  part-03.mjs
1448f4f892a03dcd24a920cfa02bf5eb2306d79b  part-04.mjs
6d66b9a0e119a9ced32e78ec6dbaeebc0918ba60  part-05.mjs
a60fa96dab91a1a3c6aa016bd99cc0688fb59628  part-06.mjs
766d305fe7f5ac451dc9db07109ecd1fef7cd220  part-07.mjs
BLOBS

cat "$ROOT"/part-*.mjs > /tmp/star-trek-maryl-cycle-v1.mjs
node --check /tmp/star-trek-maryl-cycle-v1.mjs
sha256sum /tmp/star-trek-maryl-cycle-v1.mjs > /tmp/star-trek-maryl-cycle-v1.mjs.sha256
