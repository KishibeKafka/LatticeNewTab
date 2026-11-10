/**
 * collage.js — the wall engine.
 *
 * Builds a seamless, full-bleed photo wall:
 *   rows of photos are packed edge-to-edge, each row is scaled so it spans
 *   the viewport exactly, tiles are over-sized by a few pixels so neighbours
 *   overlap, and every tile gets a small seeded rotation.
 *
 * Public API (window.LatticeCollage):
 *   render({ images, count, tilt, gap, shape, seed })
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

  const ASPECT_LIMITS = {
    mixed: [0.6, 1.75],
    square: [1, 1],
    portrait: [0.62, 0.86],
  };

  let lastOptions = null;
  let rendered = 0;

  const aspectFor = (image, shape, rand) => {
    const [min, max] = ASPECT_LIMITS[shape] || ASPECT_LIMITS.mixed;
    const natural = image && image.w && image.h ? image.w / image.h : 1;
    if (min === max) return min;
    // nudge the natural ratio so rows stay varied but not extreme
    return clamp(natural * (0.94 + rand() * 0.12), min, max);
  };

  const makeTile = (image, rect, rotation, delay, z, hue) => {
    const tile = document.createElement('figure');
    tile.className = 'tile is-entering';
    tile.style.left = `${rect.x.toFixed(1)}px`;
    tile.style.top = `${rect.y.toFixed(1)}px`;
    tile.style.width = `${rect.w.toFixed(1)}px`;
    tile.style.height = `${rect.h.toFixed(1)}px`;
    tile.style.zIndex = String(z);
    tile.style.setProperty('--hue', String(hue));
    tile.style.setProperty('--rot', `${rotation.toFixed(2)}deg`);
    tile.style.setProperty('--delay', `${Math.round(delay)}ms`);

    const frame = document.createElement('div');
    frame.className = 'tile__frame';

    const img = document.createElement('img');
    img.className = 'tile__img';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.loading = z > 2 ? 'lazy' : 'eager';
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener(
      'error',
      () => tile.classList.add('is-failed'),
      { once: true }
    );
    img.src = image.src;

    frame.appendChild(img);
    tile.appendChild(frame);
    return tile;
  };

  const render = (options = {}) => {
    if (!wall) return 0;

    const images = Array.isArray(options.images) ? options.images.filter((i) => i && i.src) : [];
    lastOptions = { ...options, images };

    if (!images.length) {
      wall.replaceChildren();
      rendered = 0;
      collage?.classList.add('is-empty');
      return 0;
    }
    collage?.classList.remove('is-empty');

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const target = clamp(Math.round(options.count || 28), 1, 120);
    const gap = clamp(Math.round(options.gap ?? 12), 0, 60);
    const tilt = clamp(Number(options.tilt) || 0, 0, 15);
    const shape = options.shape || 'mixed';
    const seed = Math.round(options.seed ?? 1);

    const rand = mulberry32(seed);
    const bleed = 48;

    // Row count tracks the viewport shape so tiles stay roughly square-ish
    // regardless of how many photos the slider asks for.
    let rows = clamp(Math.round(Math.sqrt((target * vh) / vw)), 2, 9);
    const totalW = vw + bleed * 2;
    const totalH = vh + bleed * 2;
    const rowGap = gap;
    let rowH = (totalH - rowGap * (rows - 1)) / rows;
    while (rowH < 90 && rows > 2) {
      rows -= 1;
      rowH = (totalH - rowGap * (rows - 1)) / rows;
    }

    // Shuffle the pool per render so "Shuffle" really changes the wall.
    const order = images.slice();
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const overlap = Math.min(gap * 0.35, 6);
    const frag = document.createDocumentFragment();
    let cursor = 0;
    let count = 0;

    for (let row = 0; row < rows; row += 1) {
      const picked = [];
      let sum = 0;
      let guard = 0;

      // Grow the row until it is at least wide enough to span the viewport.
      while (sum < totalW && guard < 80) {
        const image = order[cursor % order.length];
        const aspect = aspectFor(image, shape, rand);
        picked.push({ image, aspect });
        sum += rowH * aspect;
        cursor += 1;
        guard += 1;
        if (picked.length > 30) break;
      }

      while (sum > totalW * 1.9 && picked.length > 2) {
        const dropped = picked.pop();
        sum -= rowH * dropped.aspect;
      }

      const gaps = rowGap * (picked.length - 1);
      const scale = (totalW - gaps) / sum;
      const y = -bleed + row * (rowH + rowGap);
      let x = -bleed;

      for (let col = 0; col < picked.length; col += 1) {
        const { image, aspect } = picked[col];
        const width = rowH * aspect * scale;
        const rotation = (rand() * 2 - 1) * tilt;
        const delay = row * 70 + col * 24 + rand() * 50;

        frag.appendChild(
          makeTile(
            image,
            {
              x: x - overlap,
              y: y - overlap,
              w: width + overlap * 2,
              h: rowH + overlap * 2,
            },
            rotation,
            Math.min(1000, delay),
            rows - row,
            Math.round(rand() * 360)
          )
        );

        x += width + rowGap;
        count += 1;
      }
    }

    wall.replaceChildren(frag);
    rendered = count;
    return count;
  };

  window.LatticeCollage = {
    render,
    tileCount: () => rendered,
  };

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (lastOptions) render(lastOptions);
    }, 180);
  });
})();
