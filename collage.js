/**
 * collage.js — endless, gap-free masonry.
 *
 * The plane is tiled by columns whose widths vary within a repeating cycle.
 * Inside a column photos are stacked with no gaps at their natural aspect
 * ratio, and columns are flush against each other — every pixel is covered and
 * no photo ever overlaps another. Corners are square.
 *
 * Columns repeat with a per-column vertical period, so the wall is endless in
 * both axes while only the columns near the viewport stay in the DOM.
 *
 * Public API (window.LatticeCollage):
 *   render({ images, seed }) -> visible tile count
 *   setCamera(x, y)
 *   tileCount()
 */
(() => {
  'use strict';

  const wall = document.getElementById('collage-wall');
  const collage = document.getElementById('collage');

  const CYCLE = 8; // columns per horizontal cycle
  const ITEMS_PER_PERIOD = 7;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const hashCell = (x, y, seed) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };

  const state = {
    images: [],
    seed: 1,
    cam: { x: 0, y: 0 },
    widths: [],
    prefix: [],
    periodWidth: 1,
    baseWidth: 320,
  };

  /** key "column:period:index" -> tile */
  const tiles = new Map();
  /** column index -> layout */
  const columns = new Map();

  let updateFrame = 0;
  let lastRange = '';

  const buildWidths = () => {
    const base = clamp(Math.round(window.innerWidth / 4.6), 200, 380);
    const rand = mulberry32(hashCell(0, 991, state.seed));

    const widths = [];
    let total = 0;
    for (let i = 0; i < CYCLE; i += 1) {
      const width = Math.max(160, Math.round(base * (0.68 + rand() * 0.72)));
      widths.push(width);
      total += width;
    }

    const prefix = [];
    let cursor = 0;
    for (let i = 0; i < CYCLE; i += 1) {
      prefix.push(cursor);
      cursor += widths[i];
    }

    state.baseWidth = base;
    state.widths = widths;
    state.prefix = prefix;
    state.periodWidth = total;
  };

  const columnAtX = (x) => {
    const cycle = Math.floor(x / state.periodWidth);
    const local = x - cycle * state.periodWidth;
    let pos = 0;
    while (pos < CYCLE - 1 && local >= state.prefix[pos + 1]) pos += 1;
    return cycle * CYCLE + pos;
  };

  const columnOrigin = (index) => {
    const cycle = Math.floor(index / CYCLE);
    const pos = ((index % CYCLE) + CYCLE) % CYCLE;
    return {
      pos,
      x: cycle * state.periodWidth + state.prefix[pos],
      width: state.widths[pos],
    };
  };

  const getColumn = (index) => {
    const cached = columns.get(index);
    if (cached) return cached;

    const { pos, x, width } = columnOrigin(index);
    const rand = mulberry32(hashCell(index, 0, state.seed));
    const items = [];
    let cursor = 0;

    for (let k = 0; k < ITEMS_PER_PERIOD; k += 1) {
      const itemRand = mulberry32(hashCell(index, k + 1, state.seed));
      const image = state.images[Math.floor(itemRand() * state.images.length)];
      if (!image) continue;

      const aspect = clamp(image.h ? image.w / image.h : 1, 0.6, 1.8);
      const height = Math.max(80, Math.round(width / aspect));

      items.push({
        image,
        offsetY: cursor,
        width,
        height,
        hue: Math.round(itemRand() * 360),
        aspect,
      });

      cursor += height;
    }

    const height = Math.max(1, cursor);
    const phase = Math.round(rand() * height);

    const column = { x, width, pos, items, height, phase };
    columns.set(index, column);
    return column;
  };

  const createTile = (image, rect, hue) => {
    const tile = document.createElement('figure');
    tile.className = 'tile is-entering';
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', image.aria || image.label || '');
    tile.dataset.src = image.src;
    tile.dataset.label = image.label || '';
    tile.dataset.w = String(image.w || '');
    tile.dataset.h = String(image.h || '');
    tile.style.left = `${rect.x}px`;
    tile.style.top = `${rect.y}px`;
    tile.style.width = `${rect.w}px`;
    tile.style.height = `${rect.h}px`;
    tile.style.setProperty('--hue', String(hue));

    const frame = document.createElement('div');
    frame.className = 'tile__frame';

    const img = document.createElement('img');
    img.className = 'tile__img';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.loading = 'lazy';
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => tile.classList.add('is-failed'), { once: true });
    img.src = image.src;

    frame.appendChild(img);
    tile.appendChild(frame);
    return tile;
  };

  const update = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const left = -state.cam.x;
    const top = -state.cam.y;
    const right = left + vw;
    const bottom = top + vh;

    const marginX = 180;
    const marginY = 220;

    const first = columnAtX(left - marginX) - 1;
    const last = columnAtX(right + marginX) + 1;

    const range = `${first}:${last}:${Math.round(top)}:${Math.round(bottom)}`;
    if (range === lastRange) return;
    lastRange = range;

    const alive = new Set();

    for (let index = first; index <= last; index += 1) {
      const column = getColumn(index);
      if (!column.items.length) continue;

      const yTop = top - marginY - column.phase;
      const yBottom = bottom + marginY - column.phase;
      const firstPeriod = Math.floor(yTop / column.height);
      const lastPeriod = Math.floor(yBottom / column.height);

      for (let period = firstPeriod; period <= lastPeriod; period += 1) {
        for (let k = 0; k < column.items.length; k += 1) {
          const item = column.items[k];
          const key = `${index}:${period}:${k}`;
          alive.add(key);

          if (!tiles.has(key)) {
            const tile = createTile(
              item.image,
              {
                x: column.x,
                y: column.phase + period * column.height + item.offsetY,
                w: item.width,
                h: item.height,
              },
              item.hue
            );
            tiles.set(key, tile);
            wall.appendChild(tile);
          }
        }
      }
    }

    for (const [key, tile] of tiles) {
      if (alive.has(key)) continue;
      tile.remove();
      tiles.delete(key);
    }
  };

  const scheduleUpdate = () => {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0;
      update();
    });
  };

  const render = (options = {}) => {
    const images = Array.isArray(options.images) ? options.images.filter((i) => i && i.src) : [];

    state.images = images;
    state.seed = Math.round(options.seed ?? 1);
    buildWidths();

    for (const tile of tiles.values()) tile.remove();
    tiles.clear();
    columns.clear();
    lastRange = '';
    collage?.classList.toggle('is-empty', !images.length);

    if (!images.length) return 0;

    update();
    return tiles.size;
  };

  const setCamera = (x, y) => {
    state.cam = { x, y };
    if (wall) wall.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    scheduleUpdate();
  };

  const refreshLayout = () => {
    const base = clamp(Math.round(window.innerWidth / 4.6), 200, 380);
    if (base === state.baseWidth) {
      lastRange = '';
      scheduleUpdate();
      return;
    }
    buildWidths();
    for (const tile of tiles.values()) tile.remove();
    tiles.clear();
    columns.clear();
    lastRange = '';
    update();
  };

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(refreshLayout);
  });

  window.LatticeCollage = {
    render,
    setCamera,
    tileCount: () => tiles.size,
  };
})();
