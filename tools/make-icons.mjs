/**
 * Generates the extension icons (16/32/48/128 PNG) with zero dependencies.
 * Run: node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------- PNG ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};

const encodePng = (width, height, rgba) => {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/* -------------------------------- Drawing -------------------------------- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

/** Signed distance to a rounded rectangle centered at origin. */
const sdRoundRect = (x, y, halfW, halfH, r) => {
  const qx = Math.abs(x) - (halfW - r);
  const qy = Math.abs(y) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
};

const ICON_BG = [
  [0.07, 0.09, 0.20], // deep midnight
  [0.35, 0.21, 0.60], // violet
  [0.93, 0.43, 0.52], // warm coral
];

const TILE_COLORS = [
  [1.0, 0.93, 0.84],
  [0.86, 0.94, 1.0],
  [1.0, 0.82, 0.89],
  [0.88, 1.0, 0.94],
];

/**
 * The mark: a rounded-square "wall" with three tilted photo tiles.
 * Rendered analytically so it stays crisp at every size.
 */
const renderIcon = (size) => {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const half = size * 0.5;
  const corner = size * 0.235;

  // tiles: [x, y, w, h, rotationDeg, colorIndex]
  const tiles = [
    [-0.2, -0.16, 0.34, 0.44, -9, 0],
    [0.19, -0.2, 0.3, 0.28, 7, 1],
    [0.16, 0.18, 0.36, 0.3, -5, 2],
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * size + x) * 4;

      // --- background: rounded square with a diagonal 3-stop gradient ---
      const d = sdRoundRect(px - cx, py - cy, half, half, corner);
      const cover = clamp01(0.5 - d); // 1 inside, 0 outside (1px AA)
      if (cover <= 0) continue;

      const t = clamp01((px / size) * 0.55 + (py / size) * 0.45);
      const [c0, c1, c2] = ICON_BG;
      let r;
      let g;
      let b;
      if (t < 0.5) {
        const k = smoothstep(0, 0.5, t);
        r = mix(c0[0], c1[0], k);
        g = mix(c0[1], c1[1], k);
        b = mix(c0[2], c1[2], k);
      } else {
        const k = smoothstep(0.5, 1, t);
        r = mix(c1[0], c2[0], k);
        g = mix(c1[1], c2[1], k);
        b = mix(c1[2], c2[2], k);
      }

      // soft top-left light bloom
      const bloom = clamp01(1 - Math.hypot((px - size * 0.22) / size, (py - size * 0.18) / size) * 1.9);
      const l = bloom * 0.35;
      r = mix(r, 1, l);
      g = mix(g, 1, l * 0.92);
      b = mix(b, 1, l * 0.86);

      // --- photo tiles ---
      for (const [tx, ty, tw, th, deg, ci] of tiles) {
        const ox = px - (cx + tx * size);
        const oy = py - (cy + ty * size);
        const a = (-deg * Math.PI) / 180;
        const rx = ox * Math.cos(a) - oy * Math.sin(a);
        const ry = ox * Math.sin(a) + oy * Math.cos(a);
        const td = sdRoundRect(rx, ry, (tw * size) / 2, (th * size) / 2, size * 0.055);
        const tcover = clamp01(0.5 - td * (size > 48 ? 1 : 2.2));
        if (tcover <= 0) continue;
        const [tr, tg, tb] = TILE_COLORS[ci];
        // gentle inner vertical shading for depth
        const shade = 0.72 + 0.28 * smoothstep(0.35, -0.35, ry / (th * size));
        r = mix(r, tr * shade, tcover * 0.94);
        g = mix(g, tg * shade, tcover * 0.94);
        b = mix(b, tb * shade, tcover * 0.94);
      }

      rgba[i] = Math.round(clamp01(r) * 255);
      rgba[i + 1] = Math.round(clamp01(g) * 255);
      rgba[i + 2] = Math.round(clamp01(b) * 255);
      rgba[i + 3] = Math.round(cover * 255);
    }
  }

  return encodePng(size, size, rgba);
};

/* ---------------------------------- main --------------------------------- */

const outDir = resolve(ROOT, 'icons');
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = resolve(outDir, `icon${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`icons/icon${size}.png`);
}
