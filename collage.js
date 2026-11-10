/**
 * collage.js — infinite "Lattice" wall, adapted from folia-major's Lattice module.
 *
 * Mechanics borrowed from chthollyphile/folia-major
 * (src/components/wall/blockTemplates.ts, layout.ts, blockReflows.ts,
 * src/components/app/lattice/PosterWall.tsx):
 *
 *  - a 12×8 block is covered exactly by 12 cards in four base templates,
 *    each also mirrored in X/Y; the template follows the block's coordinates,
 *    so the field never reads as a plain grid;
 *  - blocks repeat over an unbounded world, and only blocks inside the
 *    viewport (plus an overscan) are instantiated; tiles are keyed by
 *    block:slot so camera moves never rebuild them;
 *  - clicking a card expands it to a 6×6 gear. A precomputed-on-demand reflow
 *    re-gears the other eleven cards of that same block to cover the rest
 *    exactly — neighbours change place/size, no other block moves;
 *  - the camera is a translate+scale of the world and glides to the expanded
 *    card; the expanded card gets the glow / inner stroke and a title band.
 *
 * Artwork is cropped to the card's gear (cover) with a focus point so the
 * subject stays in frame, as cardArtwork does in folia.
 *
 * Public API:
 *   render({ images, seed }) -> expanded rect (world) chosen at start
 *   expandTile(el) -> expanded rect | null (null = collapsed)
 *   collapse()
 *   activeRect() -> rect | null
 *   setCamera(x, y, scale)
 */
(() => {
  'use strict';

  const wall = document.getElementById('collage-wall');

  const COLS = 12;
  const ROWS = 8;
  const CELL = 128;
  const GAP = 0;
  const PITCH = CELL + GAP;
  const SLOTS = 12;
  const EXPAND_MAX_W = 10;
  const EXPAND_MAX_H = 7;

  const BLOCK_W = COLS * PITCH;
  const BLOCK_H = ROWS * PITCH;
  const MAX_TILES = 320;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const hash = (a, b, c, seed) => {
    let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519) ^ Math.imul(seed, 3266489917);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };

  /* ── templates: each covers the 12×8 block exactly (from folia-major) ── */

  const TEMPLATES = [
    [
      { x: 0, y: 0, cols: 3, rows: 2 },
      { x: 3, y: 0, cols: 6, rows: 4 },
      { x: 9, y: 0, cols: 3, rows: 2 },
      { x: 0, y: 2, cols: 3, rows: 2 },
      { x: 9, y: 2, cols: 3, rows: 4 },
      { x: 0, y: 4, cols: 4, rows: 4 },
      { x: 4, y: 4, cols: 2, rows: 2 },
      { x: 6, y: 4, cols: 3, rows: 2 },
      { x: 4, y: 6, cols: 2, rows: 2 },
      { x: 6, y: 6, cols: 2, rows: 2 },
      { x: 8, y: 6, cols: 2, rows: 2 },
      { x: 10, y: 6, cols: 2, rows: 2 },
    ],
    [
      { x: 0, y: 0, cols: 2, rows: 3 },
      { x: 2, y: 0, cols: 2, rows: 3 },
      { x: 4, y: 0, cols: 2, rows: 3 },
      { x: 6, y: 0, cols: 6, rows: 4 },
      { x: 0, y: 3, cols: 6, rows: 2 },
      { x: 6, y: 4, cols: 2, rows: 4 },
      { x: 8, y: 4, cols: 2, rows: 4 },
      { x: 10, y: 4, cols: 2, rows: 2 },
      { x: 0, y: 5, cols: 2, rows: 3 },
      { x: 2, y: 5, cols: 2, rows: 3 },
      { x: 4, y: 5, cols: 2, rows: 3 },
      { x: 10, y: 6, cols: 2, rows: 2 },
    ],
    [
      { x: 0, y: 0, cols: 6, rows: 4 },
      { x: 6, y: 0, cols: 6, rows: 3 },
      { x: 6, y: 3, cols: 4, rows: 3 },
      { x: 10, y: 3, cols: 2, rows: 2 },
      { x: 0, y: 4, cols: 4, rows: 2 },
      { x: 4, y: 4, cols: 2, rows: 2 },
      { x: 10, y: 5, cols: 2, rows: 3 },
      { x: 0, y: 6, cols: 2, rows: 2 },
      { x: 2, y: 6, cols: 2, rows: 2 },
      { x: 4, y: 6, cols: 2, rows: 2 },
      { x: 6, y: 6, cols: 2, rows: 2 },
      { x: 8, y: 6, cols: 2, rows: 2 },
    ],
    [
      { x: 0, y: 0, cols: 2, rows: 2 },
      { x: 2, y: 0, cols: 2, rows: 2 },
      { x: 4, y: 0, cols: 4, rows: 3 },
      { x: 8, y: 0, cols: 2, rows: 4 },
      { x: 10, y: 0, cols: 2, rows: 4 },
      { x: 0, y: 2, cols: 2, rows: 3 },
      { x: 2, y: 2, cols: 2, rows: 2 },
      { x: 4, y: 3, cols: 4, rows: 3 },
      { x: 2, y: 4, cols: 2, rows: 2 },
      { x: 8, y: 4, cols: 4, rows: 4 },
      { x: 0, y: 5, cols: 2, rows: 3 },
      { x: 2, y: 6, cols: 6, rows: 2 },
    ],
  ];

  const flipX = (slots) => slots.map((s) => ({ ...s, x: COLS - s.x - s.cols }));
  const flipY = (slots) => slots.map((s) => ({ ...s, y: ROWS - s.y - s.rows }));
  const REFLECTIONS = [(s) => s, flipX, flipY, (s) => flipX(flipY(s))];
  const ORIENTED = TEMPLATES.flatMap((template) => REFLECTIONS.map((reflect) => reflect(template)));

  const orientationOf = (col, row, seed) => {
    const template = ((col + row * 2) % TEMPLATES.length + TEMPLATES.length) % TEMPLATES.length;
    const reflection = hash(col, row, 7, seed) % REFLECTIONS.length;
    return template * REFLECTIONS.length + reflection;
  };

  const toWorldRect = (blockCol, blockRow, rect) => ({
    x: blockCol * BLOCK_W + rect.x * PITCH,
    y: blockRow * BLOCK_H + rect.y * PITCH,
    w: rect.cols * PITCH - GAP,
    h: rect.rows * PITCH - GAP,
  });

  /* ── local reflow: exact cover of the block minus a 6×6 window ── */

  const splitRect = (rect, count, rng, out) => {
    if (count <= 1) {
      out.push(rect);
      return;
    }

    const alongX = rect.cols >= rect.rows;
    const along = alongX ? rect.cols : rect.rows;
    if (along < 0.8) {
      out.push(rect);
      return;
    }

    const cut = clamp(along * (0.36 + rng() * 0.28), 0.4, along - 0.4);
    const wanted = clamp(Math.round((count * cut) / along), 1, count - 1);

    const first = alongX
      ? { x: rect.x, y: rect.y, cols: cut, rows: rect.rows }
      : { x: rect.x, y: rect.y, cols: rect.cols, rows: cut };
    const second = alongX
      ? { x: rect.x + cut, y: rect.y, cols: rect.cols - cut, rows: rect.rows }
      : { x: rect.x, y: rect.y + cut, cols: rect.cols, rows: rect.rows - cut };

    splitRect(first, wanted, rng, out);
    splitRect(second, count - wanted, rng, out);
  };

  const buildReflow = (orientation, slotIndex, aspect) => {
    const template = ORIENTED[orientation];
    const slot = template[slotIndex];
    if (!slot) return null;

    const ratio = clamp(aspect, 0.3, 3.4);
    const rng = mulberry32(hash(orientation, slotIndex, 31, Math.round(ratio * 1000)));

    // keep the photo's own aspect so it is shown whole, but never larger
    // than the current viewport allows at this camera scale
    const scale = state.cam.scale || 1;
    const viewW = window.innerWidth / scale;
    const viewH = window.innerHeight / scale;
    const capW = Math.min(EXPAND_MAX_W, (viewW * 0.9) / PITCH);
    const capH = Math.min(EXPAND_MAX_H, (viewH * 0.86) / PITCH);

    let expandW = capW;
    let expandH = expandW / ratio;
    if (expandH > capH) {
      expandH = capH;
      expandW = expandH * ratio;
    }
    expandW = Math.min(expandW, COLS - 0.5);
    expandH = Math.min(expandH, ROWS - 0.5);
    if (expandW / expandH > ratio) expandW = expandH * ratio;
    else expandH = expandW / ratio;

    const winX = clamp(slot.x + slot.cols / 2 - expandW / 2, 0, COLS - expandW);
    const winY = clamp(slot.y + slot.rows / 2 - expandH / 2, 0, ROWS - expandH);

    const regions = [
      { x: 0, y: 0, cols: COLS, rows: winY },
      { x: 0, y: winY + expandH, cols: COLS, rows: ROWS - winY - expandH },
      { x: 0, y: winY, cols: winX, rows: expandH },
      { x: winX + expandW, y: winY, cols: COLS - winX - expandW, rows: expandH },
    ].filter((region) => region.cols > 0.4 && region.rows > 0.4);

    const totalArea = regions.reduce((sum, r) => sum + r.cols * r.rows, 0);
    const counts = regions.map((r) => Math.max(1, Math.round((SLOTS - 1) * ((r.cols * r.rows) / totalArea))));
    let assigned = counts.reduce((a, b) => a + b, 0);
    while (assigned > SLOTS - 1) {
      const index = counts.findIndex((n) => n > 1);
      if (index < 0) break;
      counts[index] -= 1;
      assigned -= 1;
    }
    while (assigned < SLOTS - 1) {
      const index = counts.indexOf(Math.max(...counts));
      counts[index] += 1;
      assigned += 1;
    }

    const leaves = [];
    regions.forEach((region, index) => splitRect(region, counts[index], rng, leaves));

    if (leaves.length !== SLOTS - 1) return null;

    // keep card identity: assign the eleven cards to the closest new leaves
    const cards = [];
    template.forEach((slotRect, index) => {
      if (index === slotIndex) return;
      cards.push({
        index,
        cx: slotRect.x + slotRect.cols / 2,
        cy: slotRect.y + slotRect.rows / 2,
      });
    });

    const freeLeaves = leaves.map((leaf) => ({
      leaf,
      cx: leaf.x + leaf.cols / 2,
      cy: leaf.y + leaf.rows / 2,
    }));

    const rects = new Array(SLOTS);
    rects[slotIndex] = { x: winX, y: winY, cols: expandW, rows: expandH };

    while (cards.length && freeLeaves.length) {
      let bestCard = 0;
      let bestLeaf = 0;
      let bestDistance = Infinity;
      cards.forEach((card, ci) => {
        freeLeaves.forEach((entry, li) => {
          const distance = (card.cx - entry.cx) ** 2 + (card.cy - entry.cy) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestCard = ci;
            bestLeaf = li;
          }
        });
      });
      const card = cards.splice(bestCard, 1)[0];
      const entry = freeLeaves.splice(bestLeaf, 1)[0];
      rects[card.index] = entry.leaf;
    }

    // any rounding leftovers (should not happen) fall back to the template
    template.forEach((slotRect, index) => {
      if (!rects[index]) rects[index] = { ...slotRect };
    });

    return rects;
  };

  const reflowCache = new Map();
  const imageAspect = (photoIndex) => {
    const image = state.images[photoIndex];
    if (!image || !image.w || !image.h) return 1;
    return image.w / image.h;
  };

  const reflowFor = (orientation, slotIndex, aspect) => {
    const key = `${orientation}:${slotIndex}:${aspect.toFixed(3)}`;
    if (reflowCache.has(key)) return reflowCache.get(key);
    let rects = null;
    try {
      rects = buildReflow(orientation, slotIndex, aspect);
    } catch (err) {
      console.warn('[lattice] reflow failed', err);
    }
    if (!rects) rects = ORIENTED[orientation].map((slot) => ({ ...slot }));
    reflowCache.set(key, rects);
    return rects;
  };

  /* ── state ── */

  const state = {
    images: [],
    seed: 1,
    cam: { x: 0, y: 0, scale: 1 },
    active: null, // { col, row, slot }
    tiles: new Map(), // key -> { el, col, row, slot, photoIndex, layoutKey }
    focusPoints: new Map(),
    pendingFocus: new Set(),
  };

  const photoAt = (col, row, slot) => {
    if (!state.images.length) return 0;
    return hash(col, row, slot, state.seed) % state.images.length;
  };

  /* ── artwork focus (smart crop) ── */

  const applyFocus = (photoIndex) => {
    const point = state.focusPoints.get(photoIndex) || { x: 50, y: 50 };
    document
      .querySelectorAll(`.tile[data-index="${photoIndex}"] .tile__img`)
      .forEach((img) => {
        img.style.objectPosition = `${point.x}% ${point.y}%`;
      });
  };

  const ensureFocus = (photoIndex) => {
    if (state.focusPoints.has(photoIndex) || state.pendingFocus.has(photoIndex)) return;
    if (typeof window.FaceDetector !== 'function') return; // no detector: stay centred
    const image = state.images[photoIndex];
    if (!image) return;

    state.pendingFocus.add(photoIndex);
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.src = image.src;
    probe
      .decode()
      .then(async () => {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        const faces = await detector.detect(probe);
        if (faces && faces.length) {
          const box = faces[0].boundingBox;
          const x = ((box.x + box.width / 2) / probe.naturalWidth) * 100;
          const y = ((box.y + box.height / 2) / probe.naturalHeight) * 100;
          state.focusPoints.set(photoIndex, {
            x: clamp(Math.round(x), 10, 90),
            y: clamp(Math.round(y), 10, 90),
          });
        } else {
          state.focusPoints.set(photoIndex, { x: 50, y: 50 });
        }
      })
      .catch(() => {
        state.focusPoints.set(photoIndex, { x: 50, y: 50 });
      })
      .finally(() => {
        probe.removeAttribute('src');
        state.pendingFocus.delete(photoIndex);
        applyFocus(photoIndex);
      });
  };

  /* ── tiles ── */

  const releaseTile = (entry) => {
    const img = entry.el.querySelector('.tile__img');
    if (img) {
      img.removeAttribute('data-thumb');
      img.removeAttribute('src');
    }
    entry.el.remove();
  };

  const createTile = (col, row, slot, photoIndex, rect) => {
    const image = state.images[photoIndex] || state.images[0];
    const el = document.createElement('figure');
    el.className = 'tile is-entering';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.dataset.block = `${col}:${row}`;
    el.dataset.col = String(col);
    el.dataset.row = String(row);
    el.dataset.slot = String(slot);
    el.dataset.index = String(photoIndex);
    el.dataset.src = image.src;
    el.dataset.label = image.label || '';
    el.dataset.w = String(image.w || '');
    el.dataset.h = String(image.h || '');
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;

    const frame = document.createElement('div');
    frame.className = 'tile__frame';

    const img = document.createElement('img');
    img.className = 'tile__img';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.loading = 'lazy';
    img.dataset.thumb = image.src;
    img.src = image.src;
    const point = state.focusPoints.get(photoIndex) || { x: 50, y: 50 };
    img.style.objectPosition = `${point.x}% ${point.y}%`;
    img.addEventListener('load', () => {
      el.classList.remove('is-failed');
      img.classList.add('is-loaded');
    });
    img.addEventListener('error', () => {
      const thumb = img.dataset.thumb;
      if (thumb && img.getAttribute('src') !== thumb) {
        img.src = thumb;
        return;
      }
      el.classList.add('is-failed');
    });

    el.setAttribute('aria-label', image.aria || image.label || '');

    frame.appendChild(img);
    el.appendChild(frame);

    return el;
  };

  const updateTile = (entry, col, row, slot, photoIndex, rect, isExpanded) => {
    const image = state.images[photoIndex] || state.images[0];
    const { el } = entry;
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
    el.dataset.block = `${col}:${row}`;
    el.dataset.col = String(col);
    el.dataset.row = String(row);
    el.dataset.slot = String(slot);
    el.dataset.index = String(photoIndex);
    el.dataset.src = image.src;
    el.dataset.label = image.label || '';
    el.dataset.w = String(image.w || '');
    el.dataset.h = String(image.h || '');
    el.setAttribute('aria-label', image.aria || image.label || '');

    const img = el.querySelector('.tile__img');
    const desired = isExpanded && image.full ? image.full : image.src;
    img.loading = isExpanded ? 'eager' : 'lazy';
    if (img.getAttribute('src') !== desired) img.src = desired;
    const point = state.focusPoints.get(photoIndex) || { x: 50, y: 50 };
    img.style.objectPosition = `${point.x}% ${point.y}%`;
    img.style.objectFit = isExpanded ? 'contain' : 'cover';

    el.classList.toggle('is-expanded', isExpanded);
    el.setAttribute('role', isExpanded ? 'img' : 'button');
    el.tabIndex = isExpanded ? -1 : 0;
    entry.photoIndex = photoIndex;
  };

  const activeAspect = () => {
    if (!state.active) return 1;
    return imageAspect(photoAt(state.active.col, state.active.row, state.active.slot));
  };

  const layoutForBlock = (col, row) => {
    const orientation = orientationOf(col, row, state.seed);
    const activeHere = state.active && state.active.col === col && state.active.row === row;
    if (activeHere) {
      return reflowFor(orientation, state.active.slot, activeAspect());
    }
    return ORIENTED[orientation];
  };

  /* ── viewport culling ── */

  let frame = 0;
  let lastRange = '';

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  };

  const sync = () => {
    if (!state.images.length) return;

    const { x, y, scale } = state.cam;
    const left = -x / scale;
    const top = -y / scale;
    const right = (window.innerWidth - x) / scale;
    const bottom = (window.innerHeight - y) / scale;
    const overscan = 320;

    const colFrom = Math.floor((left - overscan) / BLOCK_W);
    const colTo = Math.floor((right + overscan) / BLOCK_W);
    const rowFrom = Math.floor((top - overscan) / BLOCK_H);
    const rowTo = Math.floor((bottom + overscan) / BLOCK_H);

    const needed = new Set();
    const blocks = [];
    for (let row = rowFrom; row <= rowTo; row += 1) {
      for (let col = colFrom; col <= colTo; col += 1) {
        blocks.push([col, row]);
      }
    }
    if (state.active) {
      const already = blocks.some(([c, r]) => c === state.active.col && r === state.active.row);
      if (!already) blocks.push([state.active.col, state.active.row]);
    }

    const range = `${colFrom}:${colTo}:${rowFrom}:${rowTo}:${state.active ? `${state.active.col}:${state.active.row}:${state.active.slot}` : ''}`;
    const layoutDirty = range !== lastRange;
    lastRange = range;

    let built = 0;
    for (const [col, row] of blocks) {
      if (built >= MAX_TILES) break;
      const rects = layoutForBlock(col, row);
      const isActiveBlock = Boolean(state.active && state.active.col === col && state.active.row === row);

      for (let slot = 0; slot < SLOTS; slot += 1) {
        const key = `${col}:${row}:${slot}`;
        needed.add(key);
        const photoIndex = photoAt(col, row, slot);
        const rect = toWorldRect(col, row, rects[slot]);
        const expanded = isActiveBlock && state.active.slot === slot;
        let entry = state.tiles.get(key);

        if (!entry) {
          const el = createTile(col, row, slot, photoIndex, rect);
          entry = { el, col, row, slot, photoIndex };
          state.tiles.set(key, entry);
          wall.appendChild(el);
          updateTile(entry, col, row, slot, photoIndex, rect, expanded);
          built += 1;
        } else if (layoutDirty) {
          updateTile(entry, col, row, slot, photoIndex, rect, expanded);
        }
      }
    }

    for (const [key, entry] of state.tiles) {
      if (needed.has(key)) continue;
      releaseTile(entry);
      state.tiles.delete(key);
    }

    if (state.active) ensureFocus(photoAt(state.active.col, state.active.row, state.active.slot));
  };

  /* ── public ── */

  const expandedWorldRect = () => {
    if (!state.active) return null;
    const orientation = orientationOf(state.active.col, state.active.row, state.seed);
    const rects = reflowFor(orientation, state.active.slot, activeAspect());
    return toWorldRect(state.active.col, state.active.row, rects[state.active.slot]);
  };

  const render = (options = {}) => {
    const images = Array.isArray(options.images) ? options.images.filter((i) => i && i.src) : [];
    state.images = images;
    state.seed = Math.round(options.seed ?? 1);
    if (Number.isFinite(options.scale)) state.cam.scale = options.scale;
    state.focusPoints.clear();
    state.pendingFocus.clear();

    for (const entry of state.tiles.values()) releaseTile(entry);
    state.tiles.clear();
    reflowCache.clear();
    lastRange = '';

    if (!images.length) return null;

    // open on a random card of the first block, expanded, like Lattice centring the playing song
    const rng = mulberry32(hash(state.seed, 1, 2, 3));
    const slot = Math.floor(rng() * SLOTS);
    state.active = { col: 0, row: 0, slot };

    sync();
    return expandedWorldRect();
  };

  const expandTile = (el) => {
    if (!el || el.classList.contains('is-expanded')) {
      state.active = null;
      sync();
      return null;
    }
    const col = Number(el.dataset.col);
    const row = Number(el.dataset.row);
    const slot = Number(el.dataset.slot);
    if (![col, row, slot].every(Number.isInteger)) return null;

    state.active = { col, row, slot };
    sync();
    return expandedWorldRect();
  };

  const collapse = () => {
    if (!state.active) return;
    state.active = null;
    sync();
  };

  const setCamera = (x, y, scale) => {
    if (Math.abs((state.cam.scale || 1) - scale) > 0.0001) {
      reflowCache.clear();
      lastRange = '';
    }
    state.cam = { x, y, scale };
    if (wall) {
      wall.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    }
    schedule();
  };

  window.LatticeCollage = {
    render,
    expandTile,
    collapse,
    activeRect: expandedWorldRect,
    setCamera,
    counts: () => ({ tiles: state.tiles.size, active: state.active }),
  };
})();
