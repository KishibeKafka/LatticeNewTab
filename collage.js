/**
 * collage.js — endless, virtualised photo wall.
 *
 * The wall is an infinite plane split into cells. Every cell deterministically
 * spawns one oversized, rotated tile (seeded by its coordinates + the wall
 * seed), so panning generates new photos forever without duplicates in view.
 * Only cells near the viewport are kept in the DOM.
 *
 * Public API (window.LatticeCollage):
 *   render({ images, count, tilt, gap, seed }) -> visible tile count
 *   setPan(x, y)
 *   tileCount()
 */
(() => {
  'use strict';

  const wall = document.getElementById('collage-wall');
  const collage = document.getElementById('collage');

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Stable 32-bit hash for a cell coordinate + wall seed. */
  const hashCell = (x, y, seed) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };

  const state = {
    images: [],
    count: 24,
    tilt: 3,
    gap: 8,
    seed: 1,
    cell: 240,
    panX: 0,
    panY: 0,
  };

  /** key "cx:cy" -> tile element */
  const tiles = new Map();
  let updateFrame = 0;
  let lastRange = '';

  const cellSize = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return clamp(Math.round(Math.sqrt((vw * vh) / Math.max(4, state.count))), 130, 620);
  };

  const createTile = (cx, cy) => {
    const rand = mulberry32(hashCell(cx, cy, state.seed));
    const image = state.images[Math.floor(rand() * state.images.length)];
    if (!image) return null;

    const cell = state.cell;
    const aspect = clamp(image.h ? image.w / image.h : 1, 0.66, 1.52);

    let width = cell * (1.16 + rand() * 0.66);
    let height = width / aspect;

    // guarantee coverage of the cell, then let gap create breathing room
    const minHeight = cell * 1.1;
    if (height < minHeight) {
      width *= minHeight / height;
      height = minHeight;
    }
    const maxHeight = cell * 2.2;
    if (height > maxHeight) {
      width *= maxHeight / height;
      height = maxHeight;
    }

    width = Math.max(cell * 1.06, width - state.gap);
    height = Math.max(cell * 1.06, height - state.gap);

    const offsetX = (rand() - 0.5) * cell * 0.78;
    const offsetY = (rand() - 0.5) * cell * 0.78;
    const left = cx * cell + cell / 2 + offsetX - width / 2;
    const top = cy * cell + cell / 2 + offsetY - height / 2;

    const tile = document.createElement('figure');
    tile.className = 'tile is-entering';
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', image.aria || image.label || '');
    tile.dataset.src = image.src;
    tile.dataset.label = image.label || '';
    tile.style.left = `${left.toFixed(1)}px`;
    tile.style.top = `${top.toFixed(1)}px`;
    tile.style.width = `${width.toFixed(1)}px`;
    tile.style.height = `${height.toFixed(1)}px`;
    tile.style.zIndex = String(1 + Math.floor(rand() * 40));
    tile.style.setProperty('--hue', String(Math.round(rand() * 360)));
    tile.style.setProperty('--rot', `${((rand() * 2 - 1) * state.tilt).toFixed(2)}deg`);

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
    const cell = state.cell;
    const margin = cell * 1.4;

    const minCx = Math.floor((-state.panX - margin) / cell);
    const maxCx = Math.floor((-state.panX + vw + margin) / cell);
    const minCy = Math.floor((-state.panY - margin) / cell);
    const maxCy = Math.floor((-state.panY + vh + margin) / cell);

    const range = `${minCx}:${maxCx}:${minCy}:${maxCy}`;
    if (range === lastRange) return;
    lastRange = range;

    const alive = new Set();

    for (let cy = minCy; cy <= maxCy; cy += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const key = `${cx}:${cy}`;
        alive.add(key);
        if (!tiles.has(key)) {
          const tile = createTile(cx, cy);
          if (tile) {
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
    state.count = clamp(Math.round(options.count || 24), 4, 120);
    state.tilt = clamp(Number(options.tilt) || 0, 0, 15);
    state.gap = clamp(Math.round(options.gap ?? 8), 0, 60);
    state.seed = Math.round(options.seed ?? 1);
    state.cell = cellSize();

    for (const tile of tiles.values()) tile.remove();
    tiles.clear();
    lastRange = '';

    collage?.classList.toggle('is-empty', !images.length);

    if (!images.length) return 0;

    update();
    return tiles.size;
  };

  const setPan = (x, y) => {
    state.panX = x;
    state.panY = y;
    if (wall) wall.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    scheduleUpdate();
  };

  const refreshLayout = () => {
    const cell = cellSize();
    if (cell === state.cell) {
      lastRange = '';
      scheduleUpdate();
      return;
    }
    state.cell = cell;
    for (const tile of tiles.values()) tile.remove();
    tiles.clear();
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
    setPan,
    tileCount: () => tiles.size,
  };
})();
