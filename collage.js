/**
 * collage.js — spotlight mosaic.
 *
 * The viewport is always fully covered: one selected photo sits centred at a
 * large size, and the remaining photos are packed into the four regions around
 * it (above, below, left, right) with no gaps and no overlaps.
 *
 * Selecting another photo rebuilds the composition: the old centre shrinks
 * back into the surrounding mosaic, the new photo grows into the centre, and
 * every tile animates to its new rectangle. There is no "exit" state.
 *
 * Public API (window.LatticeCollage):
 *   render({ images, selected, seed })
 *   tileCount()
 */
(() => {
  'use strict';

  const wall = document.getElementById('collage-wall');

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const hash = (a, b, seed) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };

  const state = {
    images: [],
    selected: 0,
    previous: null,
    seed: 1,
  };

  /** @type {Array<{el: HTMLElement, imageIndex: number}>} */
  let activeTiles = [];
  const leavingTimers = new Set();

  const imageAt = (index) => state.images[index] || state.images[0];

  const createTile = (image, slot) => {
    const tile = document.createElement('figure');
    tile.className = 'tile is-entering';
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', image.aria || image.label || '');
    tile.dataset.src = image.src;
    tile.dataset.label = image.label || '';
    tile.dataset.w = String(image.w || '');
    tile.dataset.h = String(image.h || '');
    tile.dataset.index = String(slot.imageIndex);
    tile.dataset.center = slot.center ? '1' : '0';
    tile.tabIndex = slot.center ? -1 : 0;
    tile.setAttribute('role', slot.center ? 'img' : 'button');
    tile.style.left = `${slot.x.toFixed(2)}px`;
    tile.style.top = `${slot.y.toFixed(2)}px`;
    tile.style.width = `${slot.w.toFixed(2)}px`;
    tile.style.height = `${slot.h.toFixed(2)}px`;
    tile.style.setProperty('--hue', String(slot.hue));

    const frame = document.createElement('div');
    frame.className = 'tile__frame';

    const img = document.createElement('img');
    img.className = 'tile__img';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.loading = 'eager';
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => tile.classList.add('is-failed'), { once: true });
    img.src = image.src;

    frame.appendChild(img);
    tile.appendChild(frame);
    return tile;
  };

  const applySlot = (el, slot) => {
    el.style.left = `${slot.x.toFixed(2)}px`;
    el.style.top = `${slot.y.toFixed(2)}px`;
    el.style.width = `${slot.w.toFixed(2)}px`;
    el.style.height = `${slot.h.toFixed(2)}px`;
    el.dataset.index = String(slot.imageIndex);
    el.dataset.center = slot.center ? '1' : '0';
    el.tabIndex = slot.center ? -1 : 0;
    el.setAttribute('role', slot.center ? 'img' : 'button');
    el.classList.toggle('is-center', Boolean(slot.center));
  };

  /* ------------------------------ layout --------------------------------- */

  const buildSlots = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const image = imageAt(state.selected);
    if (!image) return [];

    const rand = mulberry32(hash(state.selected, state.seed, 17));
    const aspect = clamp(image.w && image.h ? image.w / image.h : 1, 0.45, 2.2);

    // centre photo: as large as possible while leaving usable bands around it
    let centerW = Math.min(vw * (vw < 640 ? 0.72 : 0.64), vh * 0.76 * aspect);
    let centerH = centerW / aspect;
    const minBandY = Math.min(64, vh * 0.08);
    if ((vh - centerH) / 2 < minBandY) {
      centerH = vh - minBandY * 2;
      centerW = centerH * aspect;
    }
    if (centerW > vw * 0.88) {
      centerW = vw * 0.88;
      centerH = centerW / aspect;
    }

    const centerX = (vw - centerW) / 2 + centerW / 2;
    const centerY = (vh - centerH) / 2 + centerH / 2;

    const center = {
      x: centerX - centerW / 2,
      y: centerY - centerH / 2,
      w: centerW,
      h: centerH,
      imageIndex: state.selected,
      center: true,
      hue: Math.round(rand() * 360),
    };

    const topH = (vh - centerH) / 2;
    const sideW = (vw - centerW) / 2;

    const regions = [
      { x: 0, y: 0, w: vw, h: topH },
      { x: 0, y: vh - topH, w: vw, h: topH },
      { x: 0, y: topH, w: sideW, h: centerH },
      { x: vw - sideW, y: topH, w: sideW, h: centerH },
    ].filter((region) => region.w > 24 && region.h > 24);

    // surrounding photos, with the previous centre guaranteed a slot
    const others = [];
    for (let i = 0; i < state.images.length; i += 1) {
      if (i !== state.selected) others.push(i);
    }
    for (let i = others.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    if (state.previous != null && state.previous !== state.selected) {
      const at = others.indexOf(state.previous);
      if (at > -1) others.splice(at, 1);
      others.unshift(state.previous);
    }

    let cursor = 0;
    const pick = () => {
      if (!others.length) return state.selected;
      const value = others[cursor % others.length];
      cursor += 1;
      return value;
    };

    const slots = [center];
    const areaTotal = regions.reduce((sum, region) => sum + region.w * region.h, 0);
    if (!areaTotal) return slots;

    const target = clamp(Math.round(areaTotal / 52000), regions.length, 32);
    let remaining = target;

    regions.forEach((region, index) => {
      const isLast = index === regions.length - 1;
      const share = isLast
        ? remaining
        : Math.max(1, Math.round((target * region.w * region.h) / areaTotal));
      const count = clamp(share, 1, remaining - (regions.length - index - 1));
      remaining -= count;

      // rows/cols laid out to fill the exact rectangle
      const rows = clamp(
        Math.round(Math.sqrt((count * region.h) / region.w)),
        1,
        Math.min(count, 4)
      );
      const rowWeights = Array.from({ length: rows }, () => 0.72 + rand() * 0.56);
      const weightSum = rowWeights.reduce((a, b) => a + b, 0);

      let y = region.y;
      let left = count;

      for (let r = 0; r < rows; r += 1) {
        const isLastRow = r === rows - 1;
        const rowH = isLastRow ? region.y + region.h - y : (region.h * rowWeights[r]) / weightSum;
        const rest = rows - r - 1;
        const rowCount = isLastRow
          ? left
          : clamp(Math.round((count * rowH) / region.h), 1, left - rest);
        const cols = Math.max(1, rowCount);
        left -= cols;

        const colWeights = Array.from({ length: cols }, () => 0.66 + rand() * 0.68);
        const colSum = colWeights.reduce((a, b) => a + b, 0);
        let x = region.x;

        for (let c = 0; c < cols; c += 1) {
          const isLastCol = c === cols - 1;
          const colW = isLastCol
            ? region.x + region.w - x
            : (region.w * colWeights[c]) / colSum;

          slots.push({
            x,
            y,
            w: Math.max(1, colW),
            h: Math.max(1, rowH),
            imageIndex: pick(),
            center: false,
            hue: Math.round(rand() * 360),
          });

          x += colW;
        }

        y += rowH;
      }
    });

    return slots;
  };

  /* ----------------------------- rendering ------------------------------- */

  const render = (options = {}) => {
    const images = Array.isArray(options.images) ? options.images.filter((i) => i && i.src) : [];
    const poolChanged = images.length !== state.images.length;

    if (poolChanged) state.previous = null;

    state.images = images;
    state.seed = Math.round(options.seed ?? 1);

    const selected = clamp(Math.round(options.selected ?? 0), 0, Math.max(0, images.length - 1));
    if (selected !== state.selected) state.previous = state.selected;
    state.selected = selected;

    if (!images.length) {
      for (const tile of activeTiles) tile.el.remove();
      activeTiles = [];
      return 0;
    }

    const slots = buildSlots();
    const free = new Map();
    for (const item of activeTiles) {
      if (!free.has(item.imageIndex)) free.set(item.imageIndex, []);
      free.get(item.imageIndex).push(item);
    }

    const next = [];

    for (const slot of slots) {
      const image = imageAt(slot.imageIndex);
      const queue = free.get(slot.imageIndex);
      let tile = queue && queue.length ? queue.pop() : null;

      if (tile) {
        tile.el.classList.remove('is-leaving');
        applySlot(tile.el, slot);
        tile.el.setAttribute('aria-label', image.aria || image.label || '');
        tile.el.dataset.src = image.src;
        tile.el.dataset.label = image.label || '';
        const img = tile.el.querySelector('.tile__img');
        if (img && img.getAttribute('src') !== image.src) {
          img.classList.remove('is-loaded');
          img.src = image.src;
        }
        tile.imageIndex = slot.imageIndex;
        next.push(tile);
      } else {
        const el = createTile(image, slot);
        applySlot(el, slot);
        el.classList.toggle('is-center', Boolean(slot.center));
        wall.appendChild(el);
        next.push({ el, imageIndex: slot.imageIndex });
      }
    }

    for (const [, list] of free) {
      for (const tile of list) {
        tile.el.classList.add('is-leaving');
        const timer = setTimeout(() => {
          tile.el.remove();
          leavingTimers.delete(timer);
        }, 380);
        leavingTimers.add(timer);
      }
    }

    activeTiles = next;
    return next.length;
  };

  const tileCount = () => activeTiles.length;

  // keep the composition full-bleed when the window changes
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.images.length) render({ images: state.images, selected: state.selected, seed: state.seed });
    }, 120);
  });

  window.LatticeCollage = { render, tileCount };
})();
