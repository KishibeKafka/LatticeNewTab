/**
 * collage.js — endless masonry of non-overlapping photos.
 *
 * The plane is split into columns of a fixed pitch. Inside a column photos are
 * stacked edge-to-edge (with a gap) at their natural aspect ratio, repeating
 * with a per-column period so the wall can continue forever in both axes.
 * Columns use different widths, horizontal insets and vertical phases, so no
 * rows or seams line up and nothing ever covers anything else.
 *
 * Only the columns/items near the viewport are kept in the DOM.
 *
 * Public API (window.LatticeCollage):
 *   render({ images, seed }) -> visible tile count
 *   setCamera(x, y, z)
 *   tileCount()
 */
(() => {
  'use strict';

  const wall = document.getElementById('collage-wall');
  const collage = document.getElementById('collage');

  const GAP = 12;
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
    pitch: 320,
    cam: { x: 0, y: 0, z: 1 },
  };

  /** key "column:period:index" -> tile */
  const tiles = new Map();
  /** column index -> layout */
  const columns = new Map();

  let updateFrame = 0;
  let lastRange = '';

  const computePitch = () => clamp(Math.round(window.innerWidth / 4.4), 210, 430);

  const getColumn = (index) => {
    const cached = columns.get(index);
    if (cached) return cached;

    const rand = mulberry32(hashCell(index, 0, state.seed));
    const pitch = state.pitch;
    const available = Math.max(140, pitch - GAP);
    const columnWidth = available * (0.84 + rand() * 0.16);
    const slack = Math.max(0, pitch - GAP - columnWidth);
    const baseX = GAP * 0.5 + slack * rand() * 0.5;

    const items = [];
    let cursor = 0;

    for (let k = 0; k < ITEMS_PER_PERIOD; k += 1) {
      const itemRand = mulberry32(hashCell(index, k + 1, state.seed));
      const image = state.images[Math.floor(itemRand() * state.images.length)];
      if (!image) continue;

      const aspect = clamp(image.h ? image.w / image.h : 1, 0.6, 1.8);
      // width varies a little inside the column, height keeps the photo's
      // natural aspect so the whole image is visible (no cropping)
      const width = columnWidth * (0.95 + itemRand() * 0.05);
      const height = width / aspect;
      const x = baseX + (columnWidth - width) * itemRand();
      const gap = GAP * (0.9 + itemRand() * 0.5);

      items.push({
        image,
        aspect,
        x,
        width,
        height,
        gap,
        offsetY: cursor,
        hue: Math.round(itemRand() * 360),
      });

      cursor += height + gap;
    }

    const height = Math.max(1, cursor);
    const phase = height * (0.1 + rand() * 0.8);

    const column = { x: index * pitch, items, height, phase };
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
    tile.style.left = `${rect.x.toFixed(1)}px`;
    tile.style.top = `${rect.y.toFixed(1)}px`;
    tile.style.width = `${rect.w.toFixed(1)}px`;
    tile.style.height = `${rect.h.toFixed(1)}px`;
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
    if (state.cam.z > 1.001) return; // camera is zoomed in: keep the current set

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pitch = state.pitch;

    const left = -state.cam.x;
    const top = -state.cam.y;
    const right = left + vw;
    const bottom = top + vh;

    const marginX = pitch * 0.35;
    const marginY = 240;

    const minIndex = Math.floor((left - marginX) / pitch);
    const maxIndex = Math.floor((right + marginX) / pitch);

    const range = `${minIndex}:${maxIndex}:${Math.round(top)}:${Math.round(bottom)}`;
    if (range === lastRange) return;
    lastRange = range;

    const alive = new Set();

    for (let index = minIndex; index <= maxIndex; index += 1) {
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
                x: column.x + item.x,
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
    state.pitch = computePitch();

    for (const tile of tiles.values()) tile.remove();
    tiles.clear();
    columns.clear();
    lastRange = '';
    collage?.classList.toggle('is-empty', !images.length);

    if (!images.length) return 0;

    update();
    return tiles.size;
  };

  const setCamera = (x, y, z) => {
    state.cam = { x, y, z };
    if (wall) {
      wall.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${z.toFixed(4)})`;
    }
    if (z <= 1.001) scheduleUpdate();
  };

  const refreshLayout = () => {
    const pitch = computePitch();
    if (pitch === state.pitch) {
      lastRange = '';
      if (state.cam.z <= 1.001) scheduleUpdate();
      return;
    }
    state.pitch = pitch;
    for (const tile of tiles.values()) tile.remove();
    tiles.clear();
    columns.clear();
    lastRange = '';
    if (state.cam.z <= 1.001) update();
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
