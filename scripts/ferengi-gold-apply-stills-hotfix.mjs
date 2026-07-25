#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/ferengi-gold-apply-stills.mjs";
let text = await readFile(path, "utf8");
const before = `async function downloadOriginal(entry) {
  const { page, info } = await imageInfo(entry);
  const response = await fetchWithRetry(info.url, {
    headers: { "User-Agent": UA, Referer: entry.source_page },
  }, \`original bytes for \${entry.file}\`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length > 512, \`\${entry.file} returned implausibly small bytes (\${bytes.length})\`);
  const mime = signatureMime(bytes);
  assert(mime === entry.expected_mime, \`\${entry.file} signature is \${mime}, expected \${entry.expected_mime}\`);
  const extension = expectedExtension(mime);
  assert(extension === entry.extension, \`\${entry.file} extension drift: \${extension} != \${entry.extension}\`);
  return {
    bytes,
    receipt: {
      mediawiki_pageid: Number(page.pageid),
      mediawiki_title: page.title,
      original_url: info.url,
      original_width: Number(info.width),
      original_height: Number(info.height),
      original_timestamp: info.timestamp || null,
      mediawiki_sha1: info.sha1 || null,
      mime,
      bytes: bytes.length,
      sha256: sha256(bytes),
    },
  };
}
`;
const after = `function originalCandidates(entry, info) {
  const urls = [];
  const add = (value) => { if (value && !urls.includes(value)) urls.push(value); };
  add(info.url);
  try {
    const forced = new URL(info.url);
    forced.searchParams.set("format", "original");
    add(forced.href);
  } catch {}
  add(String(info.url).replace(/\\/revision\\/latest(?:\\?.*)?$/i, ""));
  add(\`https://memory-alpha.fandom.com/wiki/Special:Redirect/file/\${encodeURIComponent(entry.file)}\`);
  return urls;
}

async function downloadOriginal(entry) {
  const { page, info } = await imageInfo(entry);
  const failures = [];
  for (const url of originalCandidates(entry, info)) {
    try {
      const response = await fetchWithRetry(url, {
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          Referer: entry.source_page,
          Accept: entry.expected_mime === "image/png"
            ? "image/png,image/jpeg;q=0.8,*/*;q=0.1"
            : "image/jpeg,image/png;q=0.8,*/*;q=0.1",
        },
      }, \`original bytes for \${entry.file}\`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const mime = signatureMime(bytes);
      if (bytes.length <= 512 || mime !== entry.expected_mime) {
        failures.push(\`\${url} -> \${bytes.length} bytes, signature \${mime}, content-type \${response.headers.get("content-type") || "unknown"}\`);
        continue;
      }
      const extension = expectedExtension(mime);
      assert(extension === entry.extension, \`\${entry.file} extension drift: \${extension} != \${entry.extension}\`);
      return {
        bytes,
        receipt: {
          mediawiki_pageid: Number(page.pageid),
          mediawiki_title: page.title,
          original_url: response.url || url,
          imageinfo_url: info.url,
          original_width: Number(info.width),
          original_height: Number(info.height),
          original_timestamp: info.timestamp || null,
          mediawiki_sha1: info.sha1 || null,
          mime,
          bytes: bytes.length,
          sha256: sha256(bytes),
        },
      };
    } catch (error) {
      failures.push(\`\${url} -> \${error.message}\`);
    }
  }
  throw new Error(\`\${entry.file} produced no original \${entry.expected_mime} bytes: \${failures.join(" | ")}\`);
}
`;
const count = text.split(before).length - 1;
if (count !== 1) throw new Error(`expected one original download block, found ${count}`);
text = text.replace(before, after);
await writeFile(path, text);
console.log("patched original-format retrieval to bypass CDN WebP negotiation");
