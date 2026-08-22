#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=.github/recovery/star-trek-maryl-cycle-v1
while read -r expected file; do
  test "$(git hash-object "$ROOT/$file")" = "$expected" || {
    printf 'Maryl helper blob drift: %s\n' "$file" >&2
    exit 1
  }
done <<'BLOBS'
a4bf275e53bc03884e91f175278c4d137fb1d74c  part-00.mjs
770ba98c02e12399b674072a7ed7c9314564a95b  part-01.mjs
6258411e03e7a21e46697f8664d5871c6711a855  part-02.mjs
104e4a54e17b0a1130a36bd0f3505952924e0c40  part-03.mjs
1448f4f892a03dcd24a920cfa02bf5eb2306d79b  part-04.mjs
6d66b9a0e119a9ced32e78ec6dbaeebc0918ba60  part-05.mjs
ddb3b9bf5527639b5998badc33e2ddfbf9c45c8d  part-06.mjs
766d305fe7f5ac451dc9db07109ecd1fef7cd220  part-07.mjs
BLOBS

cat "$ROOT"/part-*.mjs > /tmp/star-trek-maryl-cycle-v1.mjs
node --check /tmp/star-trek-maryl-cycle-v1.mjs
sha256sum /tmp/star-trek-maryl-cycle-v1.mjs > /tmp/star-trek-maryl-cycle-v1.mjs.sha256
