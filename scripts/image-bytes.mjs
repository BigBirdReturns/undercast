import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export function imageSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50)
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) { offset++; continue; }
      const marker = buf[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      offset += 2 + buf.readUInt16BE(offset + 2);
    }
  }
  if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length > 30 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") {
    const codec = buf.toString("latin1", 12, 16);
    if (codec === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (codec === "VP8L") {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (codec === "VP8X") return { width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
  }
  return { width: 0, height: 0 };
}

export async function filedImageMeta(src, manifestEntry) {
  if (manifestEntry?.sha256 && manifestEntry?.w && manifestEntry?.h) {
    return { sha256: manifestEntry.sha256, width: manifestEntry.w, height: manifestEntry.h };
  }
  const bytes = await readFile(src);
  const dimensions = imageSize(bytes);
  if (!dimensions.width || !dimensions.height) throw new Error(`${src}: cannot read image dimensions`);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...dimensions
  };
}
