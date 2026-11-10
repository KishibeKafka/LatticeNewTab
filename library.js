/**
 * library.js — photo library: local uploads (IndexedDB blobs), network URLs
 * and curated online collections.
 *
 * - Local photos are downscaled + re-encoded to WebP before storage so a
 *   60-photo wall stays comfortably inside Chrome's storage limits.
 * - Metadata lives in chrome.storage.local; blobs live in IndexedDB.
 * - Everything is exposed through window.LatticeLibrary.
 */
(() => {
  'use strict';

  const store = window.LatticeStore;
  const META_KEY = 'lattice:library';

  const DB_NAME = 'lattice-photos';
  const DB_VERSION = 1;
  const STORE_NAME = 'photos';

  const MAX_EDGE = 1800;
  const THUMB_EDGE = 320;
  const URL_TIMEOUT = 12000;

  const fail = (code) => {
    const error = new Error(code);
    error.code = code;
    throw error;
  };

  /* --------------------------- curated sets ------------------------------ */

  const buildSet = (ids, sizes, query = '') =>
    ids.map((id, i) => {
      const [w, h] = sizes[i % sizes.length];
      const scale = Math.min(1, THUMB_EDGE / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      return {
        src: `https://picsum.photos/id/${id}/${tw}/${th}${query}`,
        full: `https://picsum.photos/id/${id}/${w}/${h}${query}`,
        w,
        h,
      };
    });

  const localItem = (file, w, h) => {
    const stem = file.replace(/\.[^.]+$/, '');
    return {
      src: `assets/defaults/thumbs/${stem}.webp`,
      full: `assets/defaults/${file}`,
      w,
      h,
    };
  };

  const CURATED = {
    classic: {
      label: 'Classic',
      color: '#ea4335',
      note: 'Bundled photos — instant, offline and always available.',
      items: [
        localItem('p01.jpg', 900, 600),
        localItem('p02.jpg', 600, 800),
        localItem('p03.jpg', 700, 700),
        localItem('p04.jpg', 600, 900),
        localItem('p05.jpg', 800, 600),
        localItem('p06.jpg', 600, 900),
        localItem('p07.jpg', 700, 700),
        localItem('p08.jpg', 600, 900),
        localItem('p09.jpg', 800, 1000),
        localItem('p10.jpg', 900, 600),
        localItem('p11.jpg', 600, 800),
        localItem('p12.jpg', 900, 600),
        localItem('p13.jpg', 700, 900),
        localItem('p14.jpg', 800, 600),
        localItem('p15.jpg', 900, 700),
        localItem('p16.jpg', 800, 1000),
        localItem('p17.jpg', 700, 900),
        localItem('p18.jpg', 900, 650),
        localItem('p19.jpg', 800, 600),
        localItem('p20.jpg', 700, 900),
        localItem('p21.jpg', 900, 600),
        localItem('p22.jpg', 700, 700),
        localItem('p23.jpg', 600, 900),
        localItem('p24.jpg', 800, 600),
      ],
    },
    editorial: {
      label: 'Editorial',
      color: '#1a73e8',
      note: 'An eclectic editorial mix of streets, landscapes and portraits.',
      items: buildSet(
        ['16', '21', '29', '36', '54', '59', '66', '71', '83', '87', '98', '104', '110', '116', '120', '74'],
        [
          [900, 1200],
          [1200, 900],
          [1000, 1000],
          [1200, 800],
        ]
      ),
    },
    noir: {
      label: 'Noir',
      color: '#3c4043',
      note: 'Monochrome frames for a quieter, high-contrast wall.',
      items: buildSet(
        ['2', '6', '19', '25', '31', '37', '43', '49', '55', '61', '68', '74', '85', '92', '101', '118'],
        [
          [900, 1200],
          [1000, 1000],
          [1200, 900],
        ],
        '?grayscale'
      ),
    },
    soft: {
      label: 'Soft focus',
      color: '#fbbc04',
      note: 'Gently blurred photography — atmospheric and low-contrast.',
      items: buildSet(
        ['4', '13', '20', '28', '38', '46', '52', '59', '66', '72', '79', '88', '96', '106', '113', '120'],
        [
          [1200, 900],
          [1000, 1000],
          [900, 1200],
        ],
        '?blur=2'
      ),
    },
    wide: {
      label: 'Wide',
      color: '#34a853',
      note: 'Panoramic crops that stretch across the wall.',
      items: buildSet(
        ['10', '21', '33', '41', '48', '56', '63', '71', '77', '84', '90', '99', '104', '116'],
        [
          [1600, 900],
          [1400, 800],
          [1800, 1000],
        ]
      ),
    },
  };

  const curatedList = () =>
    Object.entries(CURATED).map(([id, set]) => ({
      id,
      label: set.label,
      color: set.color,
      note: set.note,
      count: set.items.length,
    }));

  const curatedPool = (id) => {
    const set = CURATED[id] || CURATED.editorial;
    return set.items.map((item) => ({ ...item }));
  };

  /* ------------------------------- indexeddb ----------------------------- */

  let dbPromise = null;

  const openDb = () => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
    return dbPromise;
  };

  const runTx = async (mode, fn) => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const objectStore = tx.objectStore(STORE_NAME);
      let request;
      try {
        request = fn(objectStore);
      } catch (err) {
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  };

  const idbPut = (record) => runTx('readwrite', (s) => s.put(record));
  const idbDelete = (id) => runTx('readwrite', (s) => s.delete(id));
  const idbGetAll = () => runTx('readonly', (s) => s.getAll());
  const idbClear = () => runTx('readwrite', (s) => s.clear());

  /* --------------------------------- state ------------------------------- */

  /** @type {Array<{id:string, kind:'local'|'url', name:string, w:number, h:number, url?:string, addedAt:number}>} */
  let items = [];
  /** id -> { blob, thumb } */
  let blobs = new Map();
  const fullUrls = new Map();
  const thumbUrls = new Map();

  const isLocal = (item) => item.kind === 'local';

  const newId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

  const objectUrl = (id, which, cache) => {
    const record = blobs.get(id);
    if (!record) return '';
    let url = cache.get(id);
    if (!url) {
      url = URL.createObjectURL(record[which]);
      cache.set(id, url);
    }
    return url;
  };

  const releaseUrls = (id) => {
    if (fullUrls.has(id)) {
      URL.revokeObjectURL(fullUrls.get(id));
      fullUrls.delete(id);
    }
    if (thumbUrls.has(id)) {
      URL.revokeObjectURL(thumbUrls.get(id));
      thumbUrls.delete(id);
    }
  };

  const saveMeta = () => store.set(META_KEY, items);

  const load = async () => {
    const saved = await store.get(META_KEY);
    items = Array.isArray(saved)
      ? saved.filter(
          (item) => item && item.id && (item.kind === 'local' || item.kind === 'url')
        )
      : [];

    if (items.some(isLocal)) {
      try {
        const records = await idbGetAll();
        blobs = new Map(records.map((record) => [record.id, record]));
      } catch (err) {
        console.warn('[lattice] could not read local photos', err);
        blobs = new Map();
      }
      const before = items.length;
      items = items.filter((item) => !isLocal(item) || blobs.has(item.id));
      if (items.length !== before) await saveMeta();
    } else {
      blobs = new Map();
    }

    return items;
  };

  /* ----------------------------- image import ---------------------------- */

  const makeCanvas = (width, height) => {
    if (typeof OffscreenCanvas !== 'undefined') {
      return { canvas: new OffscreenCanvas(width, height), offscreen: true };
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, offscreen: false };
  };

  const encode = async (bitmap, width, height, quality) => {
    const { canvas, offscreen } = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (offscreen) {
      return canvas.convertToBlob({ type: 'image/webp', quality });
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
        'image/webp',
        quality
      );
    });
  };

  const processFile = async (file) => {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const thumbScale = Math.min(1, THUMB_EDGE / Math.max(width, height));
      const thumbWidth = Math.max(1, Math.round(width * thumbScale));
      const thumbHeight = Math.max(1, Math.round(height * thumbScale));

      const [blob, thumb] = await Promise.all([
        encode(bitmap, width, height, 0.82),
        encode(bitmap, thumbWidth, thumbHeight, 0.7),
      ]);

      return { blob, thumb, w: width, h: height };
    } finally {
      bitmap.close();
    }
  };

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(
      (file) => file && file.type && file.type.startsWith('image/')
    );
    const result = { added: 0, failed: 0 };

    for (const file of files) {
      try {
        const processed = await processFile(file);
        const id = newId();
        const record = { id, blob: processed.blob, thumb: processed.thumb };
        await idbPut(record);
        blobs.set(id, record);

        const meta = {
          id,
          kind: 'local',
          name: file.name || 'Photo',
          w: processed.w,
          h: processed.h,
          addedAt: Date.now(),
        };
        items.push(meta);
        result.added += 1;
      } catch (err) {
        console.warn('[lattice] could not import file', file.name, err);
        result.failed += 1;
      }
    }

    if (result.added) await saveMeta();
    return result;
  };

  const probeImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const stop = () => {
        img.onload = null;
        img.onerror = null;
        img.removeAttribute('src');
      };
      const timer = setTimeout(() => {
        stop();
        const error = new Error('timeout');
        error.code = 'timeout';
        reject(error);
      }, URL_TIMEOUT);

      img.onload = () => {
        clearTimeout(timer);
        const size = {
          w: img.naturalWidth || 1200,
          h: img.naturalHeight || 900,
        };
        stop();
        resolve(size);
      };
      img.onerror = () => {
        clearTimeout(timer);
        stop();
        const error = new Error('load-failed');
        error.code = 'load-failed';
        reject(error);
      };
      img.src = src;
    });

  const addUrl = async (rawUrl) => {
    let parsed;
    try {
      parsed = new URL(String(rawUrl).trim());
    } catch {
      fail('bad-url');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      fail('protocol');
    }
    if (items.some((item) => item.kind === 'url' && item.url === parsed.href)) {
      fail('duplicate');
    }

    const { w, h } = await probeImage(parsed.href);
    const meta = {
      id: newId(),
      kind: 'url',
      name: parsed.hostname.replace(/^www\./, ''),
      url: parsed.href,
      w,
      h,
      addedAt: Date.now(),
    };
    items.push(meta);
    await saveMeta();
    return meta;
  };

  const remove = async (id) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    items = items.filter((entry) => entry.id !== id);
    releaseUrls(id);
    blobs.delete(id);
    if (isLocal(item)) {
      try {
        await idbDelete(id);
      } catch (err) {
        console.warn('[lattice] could not delete photo', err);
      }
    }
    await saveMeta();
  };

  const clear = async () => {
    items = [];
    blobs = new Map();
    for (const id of new Set([...fullUrls.keys(), ...thumbUrls.keys()])) releaseUrls(id);
    try {
      await idbClear();
    } catch (err) {
      console.warn('[lattice] could not clear photo store', err);
    }
    await saveMeta();
  };

  /* -------------------------------- pool --------------------------------- */

  /** Renderable pool for the collage engine. */
  const pool = () =>
    items
      .map((item) => {
        if (isLocal(item)) {
          const src = objectUrl(item.id, 'thumb', thumbUrls);
          const full = objectUrl(item.id, 'blob', fullUrls);
          return src
            ? {
                src,
                full: full || src,
                w: item.w || 1200,
                h: item.h || 900,
                name: item.name,
              }
            : null;
        }
        return item.url
          ? {
              src: item.url,
              full: item.url,
              w: item.w || 1200,
              h: item.h || 900,
              name: item.name,
            }
          : null;
      })
      .filter(Boolean);

  const thumbFor = (item) =>
    isLocal(item) ? objectUrl(item.id, 'thumb', thumbUrls) : item.url;

  const counts = () => ({
    total: items.length,
    local: items.filter(isLocal).length,
    remote: items.filter((item) => item.kind === 'url').length,
  });

  window.LatticeLibrary = {
    load,
    addFiles,
    addUrl,
    remove,
    clear,
    pool,
    thumbFor,
    counts,
    items: () => items.slice(),
    curatedList,
    curatedPool,
    curatedCount: (id) => (CURATED[id] || CURATED.editorial).items.length,
    curatedLabel: (id) => (CURATED[id] || CURATED.editorial).label,
  };
})();
