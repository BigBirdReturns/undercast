// Runtime compatibility for the one sealed validator with a POSIX-only prefix.
// Loaded only by the historical replay runner and inherited by its Node children.
// No source bytes, assertions, file reads, or other temporary prefixes are changed.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { syncBuiltinESMExports } = require('node:module');
const original = fs.mkdtempSync;
fs.mkdtempSync = function (prefix, ...options) {
  if (prefix === '/tmp/lwaxana-kukulkan-projection-') {
    prefix = path.join(os.tmpdir(), 'lwaxana-kukulkan-projection-');
  }
  return original.call(this, prefix, ...options);
};
syncBuiltinESMExports();
