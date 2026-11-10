/**
 * collage.js — draggable infinite wall with in-place photo magnification.
 *
 * The wall is an endless, gap-free masonry of natural-aspect photos (square
 * corners, nothing cropped) that can be panned forever.
 *
 * Above it sits a local patch of photos. Selecting a photo never moves any
 * tile: the chosen photo scales up around its own centre, the camera pans to
 * bring that centre to the middle of the screen, and only the photos that the
 * enlarged rectangle would cover shrink (around their own centres) to make
 * room. Everything else keeps its size and position. Because the patch sits on
 * top of the wall, the space freed by shrinking shows the wall photos behind.
 *
 * Public API:
 *   render({ images, selected, focus, seed }) -> centre of the selected tile
 *   selectTile(el) -> centre of the selected tile (or null)
 *   setCamera(x, y)
 */
(() => {
  'use strict';

  const wall = document.getElementById('collage-wall');

  const CYCLE = 8;
  const ITEMS_PER_PERIOD = 7;
  const PATCH_SCALE = 1.5;
  const ROW_IMAGES = 5;

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
    seed: 1,
    cam: { x: 0, y: 0 },
    widths: [],
    prefix: [],
    periodWidth: 1,
    baseWidth: 320,
    slots: [],
    tiles: [],
    selectedSlot: 0,
    selectedImage: 0,
    patchFocus: { x: 0, y: 0 },
  };

  const aspectOf = (index) => {
    const image = state.images[index];
    if (!image) return 1;
    return image.w && image.h && image.h > 0 ? image.w / image.h : 1;
  };

  /* ══════════════════════════ endless masonry ══════════════════════════ */

  const wallTiles = new Map();
  const columns = new Map();
  let lastRange = '';
  let updateFrame = 0;

  const buildWidths = () => {
    const base = clamp(Math.round(window.innerWidth / 4.6), 200, 380);
    const rand = mulberry32(hash(0, 991, state.seed));

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
      x: cycle * state.periodWidth + state.prefix[pos],
      width: state.widths[pos],
    };
  };

  const getColumn = (index) => {
    const cached = columns.get(index);
    if (cached) return cached;

    const { x, width } = columnOrigin(index);
    const rand = mulberry32(hash(index, 0, state.seed));
    const items = [];
    let cursor = 0;

    for (let k = 0; k < ITEMS_PER_PERIOD; k += 1) {
      const itemRand = mulberry32(hash(index, k + 1, state.seed));
      const imageIndex = Math.floor(itemRand() * state.images.length);
      const image = state.images[imageIndex];
      if (!image) continue;

      const aspect = aspectOf(imageIndex);
      const height = Math.max(60, width / aspect);

      items.push({
        imageIndex,
        offsetY: cursor,
        width,
        height,
      });

      cursor += height;
    }

    const height = Math.max(1, cursor);
    const phase = Math.round(rand() * height);

    const column = { x, width, items, height, phase };
    columns.set(index, column);
    return column;
  };

  const makeTile = (imageIndex, rect, kind, meta = {}) => {
    const image = state.images[imageIndex] || state.images[0];
    const tile = document.createElement('figure');
    tile.className = `tile tile--${kind}${meta.entering ? ' is-entering' : ''}`;
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', image.aria || image.label || '');
    tile.dataset.src = image.src;
    tile.dataset.label = image.label || '';
    tile.dataset.w = String(image.w || '');
    tile.dataset.h = String(image.h || '');
    tile.dataset.index = String(imageIndex);
    tile.style.left = `${rect.x.toFixed(2)}px`;
    tile.style.top = `${rect.y.toFixed(2)}px`;
    tile.style.width = `${rect.w.toFixed(2)}px`;
    tile.style.height = `${rect.h.toFixed(2)}px`;
    tile.style.setProperty('--hue', String((imageIndex * 47) % 360));

    const frame = document.createElement('div');
    frame.className = 'tile__frame';

    const img = document.createElement('img');
    img.className = 'tile__img';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.loading = kind === 'patch' ? 'eager' : 'lazy';
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => tile.classList.add('is-failed'), { once: true });
    img.src = image.src;

    frame.appendChild(img);
    tile.appendChild(frame);
    return tile;
  };

  const updateWall = () => {
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

          if (!wallTiles.has(key)) {
            const tile = makeTile(item.imageIndex, {
              x: column.x,
              y: column.phase + period * column.height + item.offsetY,
              w: item.width,
              h: item.height,
            }, 'wall');
            wallTiles.set(key, tile);
            wall.appendChild(tile);
          }
        }
      }
    }

    for (const [key, tile] of wallTiles) {
      if (alive.has(key)) continue;
      tile.remove();
      wallTiles.delete(key);
    }
  };

  const scheduleWall = () => {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0;
      updateWall();
    });
  };

  /* ═══════════════════════ local patch (above wall) ════════════════════ */

  const clearPatch = () => {
    for (const item of state.tiles) item.el.remove();
    state.tiles = [];
    state.slots = [];
  };

  const buildPatch = (focus, selectedImage) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    clearPatch();
    state.patchFocus = focus;
    state.selectedImage = selectedImage;

    const rowW = Math.max(vw, 720) * 2;
    const patchH = Math.max(vh, 720) * PATCH_SCALE;
    const topLimit = focus.y - patchH / 2;
    const bottomLimit = focus.y + patchH / 2;

    const order = [];
    for (let i = 0; i < state.images.length; i += 1) {
      if (i !== selectedImage) order.push(i);
    }
    const rand = mulberry32(hash(selectedImage, state.seed, 71));
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    let cursor = 0;
    const take = () => {
      if (!order.length) return selectedImage;
      const value = order[cursor % order.length];
      cursor += 1;
      return value;
    };

    const rowOf = (images, y) => {
      let aspectSum = 0;
      for (const index of images) aspectSum += aspectOf(index);
      const height = rowW / Math.max(0.001, aspectSum);
      return { images, y, height };
    };

    // hero row: two photos, the selected one, two photos — selected stays centred
    const heroImages = [take(), take(), selectedImage, take(), take()];
    let heroAspect = 0;
    for (const index of heroImages) heroAspect += aspectOf(index);
    const heroH = rowW / Math.max(0.001, heroAspect);

    let selectedOffset = 0;
    for (let i = 0; i < 2; i += 1) selectedOffset += heroH * aspectOf(heroImages[i]);
    selectedOffset += (heroH * aspectOf(selectedImage)) / 2;

    const rowLeft = focus.x - selectedOffset;
    const heroY = focus.y - heroH / 2;

    const rows = [rowOf(heroImages, heroY)];

    let y = heroY;
    while (y > topLimit) {
      const images = [take(), take(), take(), take(), take()];
      const row = rowOf(images, 0);
      y -= row.height;
      row.y = y;
      rows.unshift(row);
    }

    y = heroY + heroH;
    while (y < bottomLimit) {
      const images = [take(), take(), take(), take(), take()];
      const row = rowOf(images, y);
      rows.push(row);
      y += row.height;
    }

    const slots = [];
    let selectedSlot = -1;

    for (const row of rows) {
      let x = rowLeft;
      for (const index of row.images) {
        const w = row.height * aspectOf(index);
        if (index === selectedImage && selectedSlot < 0) {
          selectedSlot = slots.length;
        }
        slots.push({ x, y: row.y, w, h: row.height, imageIndex: index });
        x += w;
      }
    }

    if (selectedSlot < 0) selectedSlot = 0;

    state.slots = slots;
    state.selectedSlot = selectedSlot;

    state.tiles = slots.map((slot, index) => {
      const el = makeTile(slot.imageIndex, slot, 'patch', { entering: true });
      el.dataset.slot = String(index);
      wall.appendChild(el);
      return { el, slotIndex: index };
    });

    applySelection();
    return selectedCenter();
  };

  const shrinkFactor = (slot, big, margin) => {
    const cx = slot.x + slot.w / 2;
    const cy = slot.y + slot.h / 2;
    const hw = slot.w / 2;
    const hh = slot.h / 2;
    const dx = Math.abs(cx - big.cx);
    const dy = Math.abs(cy - big.cy);

    if (dx >= big.hw + hw || dy >= big.hh + hh) return 1;

    const sx = (dx - big.hw - margin) / hw;
    const sy = (dy - big.hh - margin) / hh;
    const scale = Math.max(sx, sy);
    return scale > 0 ? Math.min(1, scale) : 0;
  };

  const applySelection = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const selected = state.slots[state.selectedSlot];
    if (!selected) return;

    const zoom = Math.max(
      1.2,
      Math.min((vw * 0.64) / selected.w, (vh * 0.76) / selected.h, 4)
    );

    const big = {
      cx: selected.x + selected.w / 2,
      cy: selected.y + selected.h / 2,
      hw: (selected.w * zoom) / 2,
      hh: (selected.h * zoom) / 2,
    };

    state.tiles.forEach((item, index) => {
      const slot = state.slots[index];
      const el = item.el;
      el.classList.remove('is-selected');

      if (index === state.selectedSlot) {
        el.style.setProperty('--scale', zoom.toFixed(4));
        el.style.opacity = '1';
        el.style.pointerEvents = '';
        el.classList.add('is-selected');
        el.setAttribute('role', 'img');
        el.tabIndex = -1;
        return;
      }

      const scale = shrinkFactor(slot, big, 4);
      el.style.setProperty('--scale', scale.toFixed(3));
      el.style.opacity = scale < 0.1 ? '0' : '1';
      el.style.pointerEvents = scale < 0.1 ? 'none' : '';
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
    });
  };

  const selectedCenter = () => {
    const slot = state.slots[state.selectedSlot];
    if (!slot) return null;
    return { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 };
  };

  const selectTile = (el) => {
    if (!el) return null;

    if (el.classList.contains('tile--patch')) {
      const slotIndex = Number(el.dataset.slot);
      if (!Number.isInteger(slotIndex) || slotIndex === state.selectedSlot) return null;
      state.selectedSlot = slotIndex;
      state.selectedImage = state.slots[slotIndex].imageIndex;
      applySelection();
      return selectedCenter();
    }

    if (el.classList.contains('tile--wall')) {
      const imageIndex = Number(el.dataset.index);
      if (!Number.isInteger(imageIndex)) return null;
      const focus = {
        x: el.offsetLeft + el.offsetWidth / 2,
        y: el.offsetTop + el.offsetHeight / 2,
      };
      return buildPatch(focus, imageIndex);
    }

    return null;
  };

  /* ═══════════════════════════ public API ══════════════════════════════ */

  const render = (options = {}) => {
    const images = Array.isArray(options.images) ? options.images.filter((i) => i && i.src) : [];

    state.images = images;
    state.seed = Math.round(options.seed ?? 1);
    state.selectedImage = clamp(
      Math.round(options.selected ?? 0),
      0,
      Math.max(0, images.length - 1)
    );

    buildWidths();
    for (const tile of wallTiles.values()) tile.remove();
    wallTiles.clear();
    columns.clear();
    lastRange = '';
    clearPatch();

    if (!images.length) return null;

    updateWall();
    const focus = options.focus || {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    return buildPatch(focus, state.selectedImage);
  };

  const setCamera = (x, y) => {
    state.cam = { x, y };
    if (wall) wall.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    scheduleWall();
  };

  const refresh = () => {
    if (!state.images.length) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const focus = { x: vw / 2 - state.cam.x, y: vh / 2 - state.cam.y };
    buildWidths();
    for (const tile of wallTiles.values()) tile.remove();
    wallTiles.clear();
    columns.clear();
    lastRange = '';
    updateWall();
    buildPatch(focus, state.selectedImage);
  };

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 140);
  });

  window.LatticeCollage = {
    render,
    selectTile,
    setCamera,
    tileCount: () => wallTiles.size + state.tiles.length,
  };
})();
