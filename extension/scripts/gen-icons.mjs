// Generates simple lock-glyph PNG icons (no external deps). Run: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icon");
mkdirSync(out, { recursive: true });

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const inRR = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
// shapes in a unit square [0,1]^2; returns [r,g,b,a] 0..255 or null
function sample(x, y) {
  if (inRR(x, y, 0, 0, 1, 1, 0.22)) {
    // keyhole
    if ((x - 0.5) ** 2 + (y - 0.62) ** 2 <= 0.055 ** 2 || (Math.abs(x - 0.5) <= 0.025 && y > 0.62 && y < 0.76)) return [20, 24, 40, 255];
    // body
    if (inRR(x, y, 0.24, 0.46, 0.76, 0.84, 0.05)) return [255, 255, 255, 255];
    // shackle (ring)
    const d = Math.hypot(x - 0.5, y - 0.36);
    if (y <= 0.5 && d <= 0.2 && d >= 0.1) return [255, 255, 255, 255];
    if (y > 0.36 && y <= 0.5 && (Math.abs(x - 0.34) <= 0.05 || Math.abs(x - 0.66) <= 0.05)) return [255, 255, 255, 255];
    return [79, 70, 229, 255];
  }
  return null;
}
function png(size) {
  const SS = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const s = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        if (s) { r += s[0] * s[3]; g += s[1] * s[3]; b += s[2] * s[3]; a += s[3]; }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (a > 0) { raw[o] = Math.round(r / a); raw[o + 1] = Math.round(g / a); raw[o + 2] = Math.round(b / a); }
      raw[o + 3] = Math.round(a / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
for (const s of [16, 32, 48, 128]) writeFileSync(join(out, `${s}.png`), png(s));
console.log("icons written to", out);
