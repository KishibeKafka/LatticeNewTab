/**
 * Generates the extension icons (16/32/48/128 PNG) with zero dependencies.
 * The mark is Chrome's default new-tab logo: a blue centre, white ring and
 * red / yellow / green outer sectors.
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

const RED = [234, 67, 53];
const YELLOW = [251, 188, 5];
const GREEN = [52, 168, 83];
const BLUE = [66, 133, 244];
const WHITE = [255, 255, 255];

const OUTER = 0.48; // radius as a fraction of the icon edge
const RING = 0.305; // outer edge of the white ring
const CENTRE = 0.218; // blue centre
const SAMPLES = 4; // 4x4 supersampling for crisp small sizes

/**
 * Chrome's mark: three 120-degree outer sectors (red top, yellow lower-right,
 * green lower-left), a white ring and a blue centre.
 */
const renderIcon = (size) => {
  const rgba = Buffer.alloc(size * size * 4);
  const half = size / 2;
  const samples = SAMPLES * SAMPLES;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;
          const dx = px - half;
          const dy = py - half;
          const dist = Math.hypot(dx, dy) / size;
          if (dist > OUTER) continue;

          let colour;
          if (dist <= CENTRE) {
            colour = BLUE;
          } else if (dist <= RING) {
            colour = WHITE;
          } else {
            let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (angle < 0) angle += 360;
            if (angle >= 210 && angle < 330) colour = RED;
            else if (angle >= 330 || angle < 90) colour = YELLOW;
            else colour = GREEN;
          }

          r += colour[0];
          g += colour[1];
          b += colour[2];
          covered += 1;
        }
      }

      if (!covered) continue;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / covered);
      rgba[i + 1] = Math.round(g / covered);
      rgba[i + 2] = Math.round(b / covered);
      rgba[i + 3] = Math.round((covered / samples) * 255);
    }
  }

  return rgba;
};

/* ---------------------------------- Main --------------------------------- */

const SIZES = [16, 32, 48, 128];
const dir = resolve(ROOT, 'icons');
mkdirSync(dir, { recursive: true });

for (const size of SIZES) {
  const png = encodePng(size, size, renderIcon(size));
  writeFileSync(resolve(dir, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png`);
}
