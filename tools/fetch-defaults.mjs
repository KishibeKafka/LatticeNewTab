/**
 * Downloads the bundled default wall photos into assets/defaults/.
 *
 * The images are served by Lorem Picsum, which re-hosts photography from
 * Unsplash (Unsplash License: free to use, no attribution required).
 * They are checked in so the new tab renders instantly and works offline.
 *
 * Run: node tools/fetch-defaults.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/defaults');

/** [picsum id, width, height] — mixed aspects keep the wall organic. */
const PICKS = [
  [10, 900, 600],
  [13, 600, 800],
  [23, 700, 700],
  [27, 600, 900],
  [30, 800, 600],
  [34, 600, 900],
  [40, 700, 700],
  [57, 600, 900],
  [64, 800, 1000],
  [78, 900, 600],
  [81, 600, 800],
  [95, 900, 600],
  [108, 700, 900],
  [111, 800, 600],
  [115, 900, 700],
  [122, 800, 1000],
  [17, 700, 900],
  [44, 900, 650],
  [61, 800, 600],
  [68, 700, 900],
  [85, 900, 600],
  [92, 700, 700],
  [101, 600, 900],
  [118, 800, 600],
];

mkdirSync(OUT, { recursive: true });

let index = 0;
for (const [id, width, height] of PICKS) {
  index += 1;
  const url = `https://picsum.photos/id/${id}/${width}/${height}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`skip ${url} (${res.status})`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const file = resolve(OUT, `p${String(index).padStart(2, '0')}.jpg`);
  writeFileSync(file, buf);
  console.log(
    `assets/defaults/p${String(index).padStart(2, '0')}.jpg  ${width}x${height}  ${Math.round(buf.length / 1024)}KB`
  );
}
