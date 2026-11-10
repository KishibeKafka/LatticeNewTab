/**
 * collage.js — draggable infinite wall + local spotlight patch.
 *
 * The world is an endless, gap-free masonry wall (columns of varying width,
 * natural-aspect photos, square corners). Panning is unbounded and virtualised.
 *
 * On top of the wall sits a spotlight "patch": a viewport-sized region around
 * the selected photo. Inside the patch the photo is enlarged in the centre and
 * the remaining area is re-packed gaplessly around it. The patch lives in world
 * coordinates, so dragging carries it along and reveals the plain wall beyond.
 *
 * Selecting another photo rebuilds the patch around that photo, with the old
 * centre guaranteed a surrounding slot; the camera pans to centre the new one.
 *
 * Public API:
 *   render({ images, selected, focus, seed })
 *   select({ selected, focus })
 *   setCamera(x, y)
 */
(() => {
  'use strict';

  const wall = document.getElementById('collage-wall');

  const CYCLE = 8;
  const ITEMS_PER_PERIOD = 7;
  const PATCH_SCALE = 2;
  const PATCH_CELL = 70000;

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
    cam: { x: 0, y: 0 },
    focus: { x: 0, y: 0 },
    widths: [],
    prefix: [],
    periodWidth: 1,
    baseWidth: 320,
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
      pos,
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
      });

      cursor += height;
    }

    const height = Math.max(1, cursor);
    const phase = Math.round(rand() * height);

    const column = { x, width, items, height, phase };
    columns.set(index, column);
    return column;
  };

  const makeTile = (image, rect, hue, kind, meta = {}) => {
    const tile = document.createElement('figure');
    tile.className = `tile tile--${kind}${meta.entering ? ' is-entering' : ''}`;
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', image.aria || image.label || '');
    tile.dataset.src = image.src;
    tile.dataset.label = image.label || '';
    tile.dataset.w = String(image.w || '');
    tile.dataset.h = String(image.h || '');
    tile.dataset.index = String(image.index ?? 0);
    tile.dataset.center = meta.center ? '1' : '0';
    tile.style.left = `${rect.x.toFixed(2)}px`;
    tile.style.top = `${rect.y.toFixed(2)}px`;
    tile.style.width = `${rect.w.toFixed(2)}px`;
    tile.style.height = `${rect.h.toFixed(2)}px`;
    tile.style.setProperty('--hue', String(hue));

    const frame = document.createElement('div');
    frame.className = 'tile__frame';

    const img = document.createElement('img');
    img.className = 'tile__img';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.loading = meta.center ? 'eager' : 'lazy';
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
            const tile = makeTile(
              item.image,
              {
                x: column.x,
                y: column.phase + period * column.height + item.offsetY,
                w: item.width,
                h: item.height,
              },
              item.hue,
              'wall'
            );
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

  /* ═══════════════════════════ spotlight patch ═════════════════════════ */

  /** @type {Array<{el: HTMLElement, imageIndex: number}>} */
  let patchTiles = [];
  const leavingTimers = new Set();

  const buildPatchSlots = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const image = state.images[state.selected];
    if (!image) return [];

    const rand = mulberry32(hash(state.selected, state.seed, 17));
    const aspect = clamp(image.w && image.h ? image.w / image.h : 1, 0.45, 2.2);

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

    // patch rect: oversized so dragging keeps you inside it for a while
    const patchW = Math.max(vw, 720) * PATCH_SCALE;
    const patchH = Math.max(vh, 720) * PATCH_SCALE;
    const px = state.focus.x - patchW / 2;
    const py = state.focus.y - patchH / 2;

    const center = {
      x: state.focus.x - centerW / 2,
      y: state.focus.y - centerH / 2,
      w: centerW,
      h: centerH,
      imageIndex: state.selected,
      center: true,
      hue: Math.round(rand() * 360),
    };

    const regions = [
      { x: px, y: py, w: patchW, h: center.y - py },
      { x: px, y: center.y + centerH, w: patchW, h: py + patchH - (center.y + centerH) },
      { x: px, y: center.y, w: center.x - px, h: centerH },
      { x: center.x + centerW, y: center.y, w: px + patchW - (center.x + centerW), h: centerH },
    ].filter((region) => region.w > 20 && region.h > 20);

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

    const target = clamp(Math.round(areaTotal / PATCH_CELL), regions.length, 90);
    let remaining = target;

    regions.forEach((region, index) => {
      const isLast = index === regions.length - 1;
      const share = isLast
        ? remaining
        : Math.max(1, Math.round((target * region.w * region.h) / areaTotal));
      const count = clamp(share, 1, remaining - (regions.length - index - 1));
      remaining -= count;

      const rows = clamp(
        Math.round(Math.sqrt((count * region.h) / region.w)),
        1,
        Math.min(count, 5)
      );
      const rowWeights = Array.from({ length: rows }, () => 0.72 + rand() * 0.56);
      const weightSum = rowWeights.reduce((a, b) => a + b, 0);

      let y = region.y;
      let left = count;

      for (let r = 0; r < rows; r += 1) {
        if (left <= 0) break;
        const isLastRow = r === rows - 1;
        const rowH = isLastRow ? region.y + region.h - y : (region.h * rowWeights[r]) / weightSum;
        const rest = rows - r - 1;
        const rowCount = isLastRow
          ? left
          : clamp(Math.round((count * rowH) / region.h), 1, Math.max(1, left - rest));
        const cols = Math.max(1, Math.min(rowCount, left));
        left -= cols;

        const colWeights = Array.from({ length: cols }, () => 0.66 + rand() * 0.68);
        const colSum = colWeights.reduce((a, b) => a + b, 0);
        let x = region.x;

        for (let c = 0; c < cols; c += 1) {
          const isLastCol = c === cols - 1;
          const colW = isLastCol ? region.x + region.w - x : (region.w * colWeights[c]) / colSum;

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

  const applyPatchSlot = (el, slot, image) => {
    el.style.left = `${slot.x.toFixed(2)}px`;
    el.style.top = `${slot.y.toFixed(2)}px`;
    el.style.width = `${slot.w.toFixed(2)}px`;
    el.style.height = `${slot.h.toFixed(2)}px`;
    el.dataset.index = String(slot.imageIndex);
    el.dataset.center = slot.center ? '1' : '0';
    el.dataset.src = image.src;
    el.dataset.label = image.label || '';
    el.tabIndex = slot.center ? -1 : 0;
    el.setAttribute('role', slot.center ? 'img' : 'button');
    el.setAttribute('aria-label', image.aria || image.label || '');
    el.classList.toggle('is-center', Boolean(slot.center));
  };

  const buildPatch = () => {
    const slots = buildPatchSlots();
    const imageAt = (index) => state.images[index] || state.images[0];

    const free = new Map();
    for (const item of patchTiles) {
      if (!free.has(item.imageIndex)) free.set(item.imageIndex, []);
      free.get(item.imageIndex).push(item);
    }

    const next = [];

    for (const slot of slots) {
      const image = imageAt(slot.imageIndex);
      if (!image) continue;

      const queue = free.get(slot.imageIndex);
      let tile = queue && queue.length ? queue.pop() : null;

      if (tile) {
        tile.el.classList.remove('is-leaving');
        applyPatchSlot(tile.el, slot, image);
        const img = tile.el.querySelector('.tile__img');
        if (img && img.getAttribute('src') !== image.src) {
          img.classList.remove('is-loaded');
          img.src = image.src;
        }
        tile.imageIndex = slot.imageIndex;
        next.push(tile);
      } else {
        const el = makeTile(
          { ...image, index: slot.imageIndex },
          { x: slot.x, y: slot.y, w: slot.w, h: slot.h },
          slot.hue,
          'patch',
          { center: slot.center, entering: true }
        );
        applyPatchSlot(el, slot, image);
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

    patchTiles = next;
  };

  /* ═══════════════════════════ public API ══════════════════════════════ */

  const render = (options = {}) => {
    const images = Array.isArray(options.images) ? options.images.filter((i) => i && i.src) : [];
    if (images.length !== state.images.length) state.previous = null;

    state.images = images;
    state.seed = Math.round(options.seed ?? 1);
    state.focus = options.focus || {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };

    const selected = clamp(Math.round(options.selected ?? 0), 0, Math.max(0, images.length - 1));
    if (selected !== state.selected) state.previous = state.selected;
    state.selected = selected;

    buildWidths();
    for (const tile of wallTiles.values()) tile.remove();
    wallTiles.clear();
    for (const item of patchTiles) item.el.remove();
    patchTiles = [];
    lastRange = '';
    columns.clear();

    if (!images.length) return 0;

    buildPatch();
    updateWall();
    return patchTiles.length;
  };

  const select = (options = {}) => {
    if (!state.images.length) return;
    const selected = clamp(Math.round(options.selected ?? 0), 0, state.images.length - 1);
    if (selected !== state.selected) state.previous = state.selected;
    state.selected = selected;
    state.focus = options.focus || state.focus;
    buildPatch();
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
    state.focus = { x: vw / 2 - state.cam.x, y: vh / 2 - state.cam.y };
    buildWidths();
    for (const tile of wallTiles.values()) tile.remove();
    wallTiles.clear();
    columns.clear();
    lastRange = '';
    buildPatch();
    updateWall();
  };

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 140);
  });

  window.LatticeCollage = {
    render,
    select,
    setCamera,
    tileCount: () => wallTiles.size + patchTiles.length,
  };
})();
