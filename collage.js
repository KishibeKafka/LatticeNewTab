/**
 * collage.js — wall renderer (Stage 2 preview)
 *
 * Stage 2 renders a jittered, overlapping album-art wall from a temporary
 * demo pool so the HTML/CSS shell can be evaluated in the browser.
 * Stage 3 replaces the pool + layout with the real packing engine
 * (uploads, URLs, curated sets, storage persistence).
 */
(() => {
  'use strict';

  /* ------------------------------ demo pool ------------------------------ */

  const DEMO_POOL = [
    'https://picsum.photos/seed/lattice-01/720/900',
    'https://picsum.photos/seed/lattice-02/900/900',
    'https://picsum.photos/seed/lattice-03/900/680',
    'https://picsum.photos/seed/lattice-04/700/940',
    'https://picsum.photos/seed/lattice-05/900/720',
    'https://picsum.photos/seed/lattice-06/760/760',
    'https://picsum.photos/seed/lattice-07/880/620',
    'https://picsum.photos/seed/lattice-08/720/1000',
    'https://picsum.photos/seed/lattice-09/940/700',
    'https://picsum.photos/seed/lattice-10/800/800',
    'https://picsum.photos/seed/lattice-11/700/880',
    'https://picsum.photos/seed/lattice-12/900/640',
    'https://picsum.photos/seed/lattice-13/760/980',
    'https://picsum.photos/seed/lattice-14/860/860',
    'https://picsum.photos/seed/lattice-15/920/700',
    'https://picsum.photos/seed/lattice-16/720/940',
    'https://picsum.photos/seed/lattice-17/880/660',
    'https://picsum.photos/seed/lattice-18/780/780',
    'https://picsum.photos/seed/lattice-19/700/900',
    'https://picsum.photos/seed/lattice-20/940/720',
  ];

  /* ------------------------------- helpers ------------------------------- */

  /** Deterministic PRNG so a given wall does not reshuffle on every resize. */
  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const ASPECTS = {
    mixed: [
      [3, 4], [4, 3], [1, 1], [2, 3], [4, 5], [5, 4], [3, 2], [5, 7],
    ],
    square: [[1, 1]],
    portrait: [[3, 4], [2, 3], [4, 5], [5, 7]],
  };

  const state = {
    count: 32,
    tilt: 2,
    gap: 14,
    radius: 10,
    shape: 'mixed',
    seed: 7,
  };

  let order = DEMO_POOL.slice();
  let currentOptions = { ...state };

  /* ------------------------------- rendering ----------------------------- */

  const frame = document.getElementById('collage-wall');

  const buildTile = (src, rect, rotation, delay, z) => {
    const tile = document.createElement('figure');
    tile.className = 'tile is-entering';
    tile.style.left = `${rect.x}px`;
    tile.style.top = `${rect.y}px`;
    tile.style.width = `${rect.w}px`;
    tile.style.height = `${rect.h}px`;
    tile.style.setProperty('--rot', `${rotation.toFixed(2)}deg`);
    tile.style.setProperty('--delay', `${delay}ms`);
    tile.style.zIndex = String(z);

    const inner = document.createElement('div');
    inner.className = 'tile__frame';

    const img = document.createElement('img');
    img.className = 'tile__img';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.alt = '';
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.src = src;

    inner.appendChild(img);
    tile.appendChild(inner);
    return tile;
  };

  const render = (options = {}) => {
    const opts = { ...state, ...options };
    currentOptions = opts;
    Object.assign(state, options);

    if (!frame) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const count = Math.max(1, Math.round(opts.count));
    const gap = opts.gap;

    const cols = Math.max(2, Math.round(Math.sqrt((count * vw) / vh)));
    const rows = Math.max(2, Math.ceil(count / cols));

    // Cells bleed past the viewport so the wall never shows a hard edge.
    const bleed = 34;
    const cellH = (vh + bleed * 2) / rows;

    const rand = mulberry32(opts.seed);
    const aspects = ASPECTS[opts.shape] || ASPECTS.mixed;

    const frag = document.createDocumentFragment();
    let index = 0;

    for (let row = 0; row < rows; row += 1) {
      const remaining = count - index;
      const colsInRow = Math.min(cols, remaining);
      if (colsInRow <= 0) break;
      const rowCellW = (vw + bleed * 2) / colsInRow;

      for (let col = 0; col < colsInRow; col += 1) {
        const [aw, ah] = aspects[Math.floor(rand() * aspects.length)];

        // Start from the cell height, then guarantee the tile covers the cell
        // in both axes so the wall never shows dark gutters.
        let h = cellH * (1.04 + rand() * 0.2);
        let w = h * (aw / ah);
        if (w < rowCellW * 0.96) {
          w = rowCellW * 0.96;
          h = w * (ah / aw);
        }

        const cx = -bleed + rowCellW * (col + 0.5) + (rand() - 0.5) * gap * 0.8;
        const cy = -bleed + cellH * (row + 0.5) + (rand() - 0.5) * gap * 0.8;

        const rotation = (rand() * 2 - 1) * opts.tilt;
        const delay = Math.min(900, row * 55 + col * 30 + rand() * 60);

        const src = order[index % order.length];
        frag.appendChild(
          buildTile(src, { x: cx - w / 2, y: cy - h / 2, w, h }, rotation, delay, rows - row)
        );
        index += 1;
      }
    }

    frame.replaceChildren(frag);

    // Document-level metadata used by the HUD.
    const meta = document.getElementById('wall-meta');
    if (meta) meta.textContent = `${count} tiles · ${opts.shape}`;
  };

  const shuffle = () => {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    state.seed = Math.floor(Math.random() * 100000);
    render({ ...currentOptions, seed: state.seed });
  };

  /* -------------------------------- public ------------------------------- */

  window.LatticeCollage = {
    render,
    shuffle,
    poolSize: () => order.length,
    pool: () => order,
  };

  // First paint: keep the lattice loader visible until the first frame lands.
  const start = () => {
    const collage = document.getElementById('collage');
    if (collage) collage.classList.add('is-empty');
    requestAnimationFrame(() => {
      render(state);
      requestAnimationFrame(() => collage && collage.classList.remove('is-empty'));
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render(currentOptions), 200);
  });
})();
