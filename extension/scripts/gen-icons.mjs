// Generates the "flat heartbeat" mark PNG icons (same glyph as the web app) (no external deps). Run: node scripts/gen-icons.mjs
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
// The mark: a wax seal with a heartbeat pressed into it (frontend/src/components/Logo.tsx, viewBox 64).
const PULSE = [[14, 34], [22.5, 34], [26.7, 23], [33.7, 43], [38, 34], [50, 34]].map(([x, y]) => [x / 64, y / 64]);
function distToSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
let STROKE = 0.03;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// shapes in a unit square [0,1]^2; returns [r,g,b,a] 0..255 or null
function sample(x, y) {
  const r = Math.hypot(x - 0.5, y - 0.5);
  if (r > 0.47) return null;
  let d = Infinity;
  for (let i = 0; i < PULSE.length - 1; i++) d = Math.min(d, distToSeg(x, y, PULSE[i], PULSE[i + 1]));
  if (d <= STROKE) return [110, 29, 22, 255];
  if (Math.abs(r - 0.336) < 0.014) return [122, 34, 26, 255];
  // wax lit from the top left
  const l = Math.min(1, Math.hypot(x - 0.38, y - 0.32) / 0.6);
  const c = l < 0.55 ? mix([196, 74, 62], [168, 53, 43], l / 0.55) : mix([168, 53, 43], [125, 36, 28], (l - 0.55) / 0.45);
  return [...c, 255];
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
for (const s of [16, 32, 48, 128]) {
  STROKE = s <= 16 ? 0.06 : s <= 32 ? 0.045 : 0.032; // thicker line where pixels are scarce
  writeFileSync(join(out, `${s}.png`), png(s));
}
console.log("icons written to", out);
