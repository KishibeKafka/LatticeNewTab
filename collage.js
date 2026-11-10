/**
 * collage.js — draggable infinite wall + local spotlight patch.
 *
 * Wall: endless gap-free masonry, draggable, virtualised. Every photo keeps its
 * natural aspect ratio, so nothing is cropped.
 *
 * Patch: a world-anchored local composition around the selected photo. The
 * centre is enlarged, and the space above/below is filled with full-width rows
 * of complete photos; left/right are filled with columns whose photos stack to
 * exactly the centre height. Photos keep their natural aspect, so they are
 * never cropped.
 *
 * The surrounding photo order is stable: selecting a photo only swaps it with
 * the current centre (or appends the old centre), so neighbourhood photos keep
 * their slots and glide to their new rectangles instead of flying around.
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
  const PATCH_ROW_WIDTH = 1.5; // × viewport width
  const ROW_IMAGES = 5;
  const SIDE_COLUMNS = 3;
  const COLUMN_IMAGES = 2;
  const SURROUND_SLOTS = ROW_IMAGES * 2 + SIDE_COLUMNS * COLUMN_IMAGES * 2;

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
    seed: 1,
    cam: { x: 0, y: 0 },
    focus: { x: 0, y: 0 },
    widths: [],
    prefix: [],
    periodWidth: 1,
    baseWidth: 320,
    /** surrounding occurrences: [{ id, img }] — duplicates have distinct ids */
    order: [],
    centerToken: null,
    tokenSeq: 0,
  };

  const newToken = (img) => {
    state.tokenSeq += 1;
    return { id: `t${state.tokenSeq}`, img };
  };

  const aspectOf = (index) => {
    const image = state.images[index];
    if (!image) return 1;
    return clamp(image.w && image.h ? image.w / image.h : 1, 0.45, 2.2);
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
      const imageIndex = Math.floor(itemRand() * state.images.length);
      const image = state.images[imageIndex];
      if (!image) continue;

      // height follows the natural aspect: nothing is cropped
      const aspect = aspectOf(imageIndex);
      const height = Math.max(60, width / aspect);

      items.push({
        image,
        imageIndex,
        offsetY: cursor,
        width,
        height,
        hue: (imageIndex * 47) % 360,
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
    tile.tabIndex = meta.center ? -1 : 0;
    tile.setAttribute('role', meta.center ? 'img' : 'button');
    tile.setAttribute('aria-label', image.aria || image.label || '');
    tile.dataset.src = image.src;
    tile.dataset.label = image.label || '';
    tile.dataset.w = String(image.w || '');
    tile.dataset.h = String(image.h || '');
    tile.dataset.index = String(imageIndex);
    tile.dataset.center = meta.center ? '1' : '0';
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

  /* ═══════════════════════════ spotlight patch ═════════════════════════ */

  let patchTiles = [];
  const leavingTimers = new Set();

  const nextInOrder = (cursor) => {
    if (!state.order.length) return state.selected;
    const value = state.order[cursor % state.order.length];
    return value;
  };

  const buildPatchSlots = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const image = state.images[state.selected];
    if (!image) return [];

    const aspect = aspectOf(state.selected);

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

    const centerToken = state.centerToken || newToken(state.selected);

    const center = {
      x: state.focus.x - centerW / 2,
      y: state.focus.y - centerH / 2,
      w: centerW,
      h: centerH,
      imageIndex: centerToken.img,
      tokenId: centerToken.id,
      center: true,
    };

    const slots = [center];
    const rowWidth = Math.max(vw, 720) * PATCH_ROW_WIDTH;
    let cursor = 0;

    const take = () => {
      if (cursor < state.order.length) {
        const token = state.order[cursor];
        cursor += 1;
        return token;
      }
      // geometry needed more occurrences than planned: extend with a new one
      const token = newToken(state.selected);
      state.order.push(token);
      cursor += 1;
      return token;
    };

    const laidRow = () => {
      const tokens = [];
      let aspectSum = 0;
      for (let i = 0; i < ROW_IMAGES; i += 1) {
        const token = take();
        tokens.push(token);
        aspectSum += aspectOf(token.img);
      }
      const height = rowWidth / Math.max(0.001, aspectSum);
      let x = state.focus.x - rowWidth / 2;
      const items = [];
      for (const token of tokens) {
        const width = height * aspectOf(token.img);
        items.push({ token, x, width, height });
        x += width;
      }
      return items;
    };

    // top row, flush against the centre
    for (const item of laidRow()) {
      slots.push({
        x: item.x,
        y: center.y - item.height,
        w: item.width,
        h: item.height,
        imageIndex: item.token.img,
        tokenId: item.token.id,
        center: false,
      });
    }

    // bottom row, flush against the centre
    for (const item of laidRow()) {
      slots.push({
        x: item.x,
        y: center.y + centerH,
        w: item.width,
        h: item.height,
        imageIndex: item.token.img,
        tokenId: item.token.id,
        center: false,
      });
    }

    // side columns stack to exactly the centre height
    const laidColumn = () => {
      const tokens = [];
      let inverseSum = 0;
      for (let i = 0; i < COLUMN_IMAGES; i += 1) {
        const token = take();
        tokens.push(token);
        inverseSum += 1 / aspectOf(token.img);
      }
      const width = centerH / Math.max(0.001, inverseSum);
      const items = [];
      let y = center.y;
      for (const token of tokens) {
        const height = width / aspectOf(token.img);
        items.push({ token, y, width, height });
        y += height;
      }
      return items;
    };

    let x = center.x;
    for (let c = 0; c < SIDE_COLUMNS; c += 1) {
      const column = laidColumn();
      x -= column[0].width;
      for (const item of column) {
        slots.push({
          x,
          y: item.y,
          w: item.width,
          h: item.height,
          imageIndex: item.token.img,
          tokenId: item.token.id,
          center: false,
        });
      }
    }

    x = center.x + centerW;
    for (let c = 0; c < SIDE_COLUMNS; c += 1) {
      const column = laidColumn();
      for (const item of column) {
        slots.push({
          x,
          y: item.y,
          w: item.width,
          h: item.height,
          imageIndex: item.token.img,
          tokenId: item.token.id,
          center: false,
        });
      }
      x += column[0].width;
    }

    return slots;
  };

  const applyPatchSlot = (el, slot, imageIndex) => {
    const image = state.images[imageIndex] || state.images[0];
    el.style.left = `${slot.x.toFixed(2)}px`;
    el.style.top = `${slot.y.toFixed(2)}px`;
    el.style.width = `${slot.w.toFixed(2)}px`;
    el.style.height = `${slot.h.toFixed(2)}px`;
    el.dataset.index = String(imageIndex);
    el.dataset.token = slot.tokenId || '';
    el.dataset.center = slot.center ? '1' : '0';
    el.dataset.src = image.src;
    el.dataset.label = image.label || '';
    el.dataset.w = String(image.w || '');
    el.dataset.h = String(image.h || '');
    el.tabIndex = slot.center ? -1 : 0;
    el.setAttribute('role', slot.center ? 'img' : 'button');
    el.setAttribute('aria-label', image.aria || image.label || '');
    el.classList.toggle('is-center', Boolean(slot.center));

    const img = el.querySelector('.tile__img');
    if (img && img.getAttribute('src') !== image.src) {
      img.classList.remove('is-loaded');
      img.src = image.src;
    }
  };

  const layoutPatch = () => {
    const slots = buildPatchSlots();
    const free = new Map();
    for (const item of patchTiles) {
      if (!free.has(item.tokenId)) free.set(item.tokenId, []);
      free.get(item.tokenId).push(item);
    }

    const next = [];

    for (const slot of slots) {
      const queue = free.get(slot.tokenId);
      let tile = queue && queue.length ? queue.pop() : null;

      if (tile) {
        tile.el.classList.remove('is-leaving');
        applyPatchSlot(tile.el, slot, slot.imageIndex);
        tile.tokenId = slot.tokenId;
        next.push(tile);
      } else {
        const el = makeTile(slot.imageIndex, { x: slot.x, y: slot.y, w: slot.w, h: slot.h }, 'patch', {
          center: slot.center,
          entering: true,
        });
        applyPatchSlot(el, slot, slot.imageIndex);
        wall.appendChild(el);
        next.push({ el, tokenId: slot.tokenId });
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
    return { x: state.focus.x, y: state.focus.y };
  };

  /* ═══════════════════════════ public API ══════════════════════════════ */

  const buildTokens = (selectedImage) => {
    const others = [];
    for (let i = 0; i < state.images.length; i += 1) {
      if (i !== selectedImage) others.push(i);
    }
    const rand = mulberry32(hash(selectedImage, state.seed, 53));
    for (let i = others.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }

    const pool = others.length ? others : [selectedImage];
    state.order = [];
    for (let i = 0; i < SURROUND_SLOTS; i += 1) {
      state.order.push(newToken(pool[i % pool.length]));
    }
    state.centerToken = newToken(selectedImage);
    state.selected = selectedImage;
  };

  const render = (options = {}) => {
    const images = Array.isArray(options.images) ? options.images.filter((i) => i && i.src) : [];

    state.images = images;
    state.seed = Math.round(options.seed ?? 1);
    state.focus = options.focus || {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    state.selected = clamp(Math.round(options.selected ?? 0), 0, Math.max(0, images.length - 1));

    buildWidths();
    for (const tile of wallTiles.values()) tile.remove();
    wallTiles.clear();
    for (const item of patchTiles) item.el.remove();
    patchTiles = [];
    lastRange = '';
    columns.clear();

    if (!images.length) return 0;

    buildTokens(state.selected);
    updateWall();
    layoutPatch();
    return { x: state.focus.x, y: state.focus.y };
  };

  const selectTile = (el) => {
    if (!el || !state.images.length) return null;

    if (el.classList.contains('tile--patch')) {
      if (el.dataset.center === '1') return null;
      const tokenId = el.dataset.token;
      const at = state.order.findIndex((token) => token.id === tokenId);
      if (at < 0 || !state.centerToken) return null;

      const clicked = state.order[at];
      const oldCenter = state.centerToken;
      // swap occurrences (ids), not images: duplicates stay distinct
      state.order[at] = oldCenter;
      state.centerToken = clicked;
      state.selected = clicked.img;

      state.focus = {
        x: el.offsetLeft + el.offsetWidth / 2,
        y: el.offsetTop + el.offsetHeight / 2,
      };

      layoutPatch();
      return { x: state.focus.x, y: state.focus.y };
    }

    if (el.classList.contains('tile--wall')) {
      const imageIndex = Number(el.dataset.index);
      if (!Number.isInteger(imageIndex)) return null;
      const focus = {
        x: el.offsetLeft + el.offsetWidth / 2,
        y: el.offsetTop + el.offsetHeight / 2,
      };
      state.focus = focus;
      buildTokens(imageIndex);
      layoutPatch();
      return focus;
    }

    return null;
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
    updateWall();
    layoutPatch();
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
    tileCount: () => wallTiles.size + patchTiles.length,
  };
})();
