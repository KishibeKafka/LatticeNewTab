/**
 * app.js — draggable wall, spotlight selection, settings drawer and sources.
 * World/patch layout lives in collage.js, photo storage in library.js.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const store = window.LatticeStore;
  const library = window.LatticeLibrary;
  const engine = window.LatticeCollage;
  const i18n = window.LatticeI18n;
  const t = (key, vars) => i18n.t(key, vars);

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const SETTINGS_KEY = 'lattice:settings';

  const DEFAULTS = {
    dim: 0,
    blur: 0,
    grain: false,
    source: 'curated',
    collection: 'classic',
    language: 'auto',
  };

  const RANGES = {
    dim: [0, 90],
    blur: [0, 18],
  };

  const DELETE_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  let settings = { ...DEFAULTS };
  let wallSeed = Math.floor(Math.random() * 1e6);
  let toastTimer = 0;
  let appliedLanguage = null;

  /* ------------------------------- toast --------------------------------- */

  const toastEl = $('toast');

  const notify = (message, ms = 2200) => {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
      setTimeout(() => {
        if (!toastEl.classList.contains('is-visible')) toastEl.hidden = true;
      }, 320);
    }, ms);
  };

  /* ------------------------------- drawer -------------------------------- */

  const drawer = $('drawer');
  const scrim = $('scrim');
  const settingsBtn = $('open-settings');
  const closeBtn = $('close-settings');

  const activateTab = (name) => {
    document.querySelectorAll('.src-tab').forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.src-panel').forEach((panel) => {
      const active = panel.dataset.panel === name;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
  };

  const isDrawerOpen = () => document.body.classList.contains('is-drawer-open');

  const setDrawer = (open, tab) => {
    document.body.classList.toggle('is-drawer-open', open);
    settingsBtn?.setAttribute('aria-expanded', String(open));
    drawer?.setAttribute('aria-hidden', String(!open));
    if (open) {
      if (tab) activateTab(tab);
      drawer?.focus({ preventScroll: true });
    } else if (document.activeElement && drawer.contains(document.activeElement)) {
      settingsBtn?.focus({ preventScroll: true });
    }
  };

  /* ------------------------------- camera -------------------------------- */

  const camera = { x: 0, y: 0, scale: 1 };
  const getScale = () => {
    const width = window.innerWidth;
    if (width < 520) return 0.46;
    if (width < 640) return 0.52;
    if (width < 1100) return 0.64;
    return 0.76;
  };

  let camFrame = 0;
  let panFrame = 0;
  let camBusy = false;
  let velocity = { x: 0, y: 0 };
  let drag = null;
  let lastViewport = { w: window.innerWidth, h: window.innerHeight };

  const applyCamera = () => engine.setCamera(camera.x, camera.y, camera.scale);

  const targetForRect = (rect) => ({
    x: window.innerWidth / 2 - (rect.x + rect.w / 2) * camera.scale,
    y: window.innerHeight / 2 - (rect.y + rect.h / 2) * camera.scale,
  });

  const animateCamera = (target, duration = 650) => {
    cancelAnimationFrame(camFrame);
    camBusy = true;
    const from = { x: camera.x, y: camera.y };
    const start = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 5);
      camera.x = from.x + (target.x - from.x) * eased;
      camera.y = from.y + (target.y - from.y) * eased;
      applyCamera();
      if (progress < 1) {
        camFrame = requestAnimationFrame(step);
      } else {
        camBusy = false;
      }
    };

    camFrame = requestAnimationFrame(step);
  };

  const centerOnRect = (rect, animate = true) => {
    if (!rect) return;
    const target = targetForRect(rect);
    if (animate) animateCamera(target, 650);
    else {
      camera.x = target.x;
      camera.y = target.y;
      applyCamera();
    }
  };

  const resetCamera = () => {
    cancelAnimationFrame(camFrame);
    cancelAnimationFrame(panFrame);
    camBusy = false;
    velocity = { x: 0, y: 0 };
    camera.scale = getScale();
    camera.x = 0;
    camera.y = 0;
    applyCamera();
  };

  const startInertia = () => {
    cancelAnimationFrame(panFrame);
    panFrame = requestAnimationFrame(function step() {
      velocity.x *= 0.94;
      velocity.y *= 0.94;
      camera.x += velocity.x * 16;
      camera.y += velocity.y * 16;
      applyCamera();
      if (Math.hypot(velocity.x, velocity.y) > 0.015) {
        panFrame = requestAnimationFrame(step);
      }
    });
  };

  const collageEl = $('collage');

  collageEl?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || camBusy) return;
    cancelAnimationFrame(panFrame);
    velocity = { x: 0, y: 0 };
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: camera.x,
      originY: camera.y,
      lastX: event.clientX,
      lastY: event.clientY,
      lastT: performance.now(),
      moved: false,
      tile: event.target.closest('.tile'),
    };
    try {
      collageEl.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  });

  collageEl?.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
      document.body.classList.add('is-panning');
    }
    if (!drag.moved) return;

    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    velocity = {
      x: (event.clientX - drag.lastX) / dt,
      y: (event.clientY - drag.lastY) / dt,
    };
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastT = now;

    camera.x = drag.originX + dx;
    camera.y = drag.originY + dy;
    applyCamera();
  });

  const endPan = (event) => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const { moved, tile } = drag;
    drag = null;
    document.body.classList.remove('is-panning');

    if (!moved) {
      if (tile) selectTile(tile);
      else engine.collapse();
      return;
    }
    if (Math.hypot(velocity.x, velocity.y) > 0.06) startInertia();
  };

  collageEl?.addEventListener('pointerup', endPan);
  collageEl?.addEventListener('pointercancel', endPan);

  /* ------------------------------- wall ---------------------------------- */

  const currentCollection = () => settings.collection || 'classic';
  const setLabel = (id) => t(`set.${id}.label`);

  const decorate = (items, label) =>
    items.map((item, index) => ({
      ...item,
      index,
      label: item.name || label,
      aria: item.name ? `${t('lightbox.open')} · ${item.name}` : t('lightbox.open'),
    }));

  const poolFor = () => {
    const localPool = library.pool();
    if (settings.source === 'library' && localPool.length) {
      return { pool: localPool, label: t('source.library') };
    }
    const id = currentCollection();
    return { pool: library.curatedPool(id), label: setLabel(id) };
  };

  const renderWall = () => {
    const { pool, label } = poolFor();
    camera.scale = getScale();
    const rect = engine.render({
      images: pool.length ? decorate(pool, label) : [],
      seed: wallSeed,
      scale: camera.scale,
    });
    if (rect) centerOnRect(rect, false);
    else applyCamera();
  };

  const selectTile = (tile) => {
    if (!tile) return;
    const rect = engine.expandTile(tile);
    if (rect) centerOnRect(rect, true);
  };

  $('collage-wall')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const tile = event.target.closest('.tile');
    if (!tile) return;
    event.preventDefault();
    selectTile(tile);
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const old = camera;
      const ratio = getScale();
      const worldCenter = {
        x: (lastViewport.w / 2 - old.x) / old.scale,
        y: (lastViewport.h / 2 - old.y) / old.scale,
      };
      camera.scale = ratio;
      engine.setCamera(camera.x, camera.y, ratio);
      const rect = engine.activeRect();
      if (rect) {
        const target = targetForRect(rect);
        camera.x = target.x;
        camera.y = target.y;
      } else {
        camera.x = window.innerWidth / 2 - worldCenter.x * ratio;
        camera.y = window.innerHeight / 2 - worldCenter.y * ratio;
      }
      lastViewport = { w: window.innerWidth, h: window.innerHeight };
      applyCamera();
    }, 150);
  });

  /* --------------------------- library drawer UI -------------------------- */

  const thumbsEl = $('thumbs');
  const urlThumbsEl = $('url-thumbs');
  const clearBtn = $('clear-library');
  const collectionsEl = $('collections');
  const sourceCount = $('source-count');

  const buildThumb = (item) => {
    const figure = document.createElement('figure');
    figure.className = 'thumb';

    const img = document.createElement('img');
    img.alt = item.name || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = library.thumbFor(item);
    figure.appendChild(img);

    const remove = document.createElement('button');
    remove.className = 'thumb__remove';
    remove.type = 'button';
    remove.setAttribute('aria-label', t('action.removePhoto', { name: item.name || '' }));
    remove.innerHTML = DELETE_ICON;
    remove.addEventListener('click', async () => {
      await library.remove(item.id);
      await afterLibraryChange(t('toast.removed', { name: item.name || '' }));
    });
    figure.appendChild(remove);

    return figure;
  };

  const renderThumbList = (container, items) => {
    if (!container) return;
    container.replaceChildren(...items.map(buildThumb));
  };

  const updateSourceCount = () => {
    if (!sourceCount) return;
    const n =
      settings.source === 'library'
        ? library.counts().total
        : library.curatedCount(currentCollection());
    sourceCount.textContent = t('unit.photos', { n });
  };

  const refreshLibraryUI = () => {
    const items = library.items();
    renderThumbList(thumbsEl, items.filter((item) => item.kind === 'local'));
    renderThumbList(urlThumbsEl, items.filter((item) => item.kind === 'url'));
    if (clearBtn) clearBtn.hidden = items.length === 0;
    updateSourceCount();
  };

  const afterLibraryChange = async (message) => {
    if (settings.source === 'library' && library.counts().total === 0) {
      settings.source = 'curated';
      persist();
    }
    syncControls();
    refreshLibraryUI();
    resetCamera();
    renderWall();
    if (message) notify(message);
  };

  /* ---------------------------- persistence ------------------------------ */

  let saveTimer = 0;
  const persist = (immediate = false) => {
    clearTimeout(saveTimer);
    const commit = () => store.set(SETTINGS_KEY, { ...settings });
    if (immediate) commit();
    else saveTimer = setTimeout(commit, 250);
  };

  /* ------------------------------ controls ------------------------------- */

  const setRangeFill = (input) => {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const pct = ((Number(input.value) - min) / (max - min || 1)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  };

  const syncSeg = (containerId, value) => {
    const container = $(containerId);
    if (!container) return;
    container.querySelectorAll('button[data-value]').forEach((btn) => {
      const active = String(btn.dataset.value) === String(value);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  };

  const sliderOutput = {
    dim: (v) => t('unit.percent', { n: v }),
    blur: (v) => t('unit.px', { n: v }),
  };

  const rebuildChipLabels = () => {
    if (!collectionsEl) return;
    collectionsEl.querySelectorAll('.chip[data-collection]').forEach((chip) => {
      const id = chip.dataset.collection;
      chip.textContent = `${setLabel(id)} · ${chip.dataset.count}`;
    });
  };

  const refreshTileLabels = () => {
    document.querySelectorAll('.tile').forEach((tile) => {
      const name = tile.dataset.label;
      tile.setAttribute('aria-label', name ? `${t('lightbox.open')} · ${name}` : t('lightbox.open'));
    });
  };

  const ensureLanguage = () => {
    if (appliedLanguage === settings.language) return false;
    appliedLanguage = settings.language;
    i18n.apply(settings.language);
    rebuildChipLabels();
    refreshTileLabels();
    return true;
  };

  const syncControls = () => {
    const languageChanged = ensureLanguage();
    const root = document.documentElement;

    root.style.setProperty('--bg-blur', `${settings.blur}px`);
    root.style.setProperty('--dim', String(settings.dim / 100));
    root.style.setProperty('--grain-opacity', settings.grain ? '0.06' : '0');

    for (const id of Object.keys(RANGES)) {
      const input = $(id);
      if (!input) continue;
      input.value = String(settings[id]);
      setRangeFill(input);
      const out = $(`${id}-out`);
      if (out && sliderOutput[id]) out.textContent = sliderOutput[id](settings[id]);
    }

    syncSeg('lang-seg', settings.language);

    const grainToggle = $('grain');
    if (grainToggle) grainToggle.checked = settings.grain;

    document.querySelectorAll('.chip[data-collection]').forEach((chip) => {
      chip.classList.toggle(
        'is-active',
        settings.source === 'curated' && chip.dataset.collection === currentCollection()
      );
    });

    updateSourceCount();
    return languageChanged;
  };

  const applySettings = (partial = {}, options = {}) => {
    settings = { ...settings, ...partial };
    const languageChanged = syncControls();
    if (languageChanged) {
      refreshLibraryUI();
      renderWall();
    }
    if (options.save !== false) persist(options.immediateSave);
  };

  for (const id of Object.keys(RANGES)) {
    const input = $(id);
    if (!input) continue;
    setRangeFill(input);
    input.addEventListener('input', () => {
      setRangeFill(input);
      applySettings({ [id]: Number(input.value) });
    });
  }

  const bindSeg = (containerId, onPick) => {
    const container = $(containerId);
    if (!container) return;
    container.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-value]');
      if (!btn) return;
      onPick(btn.dataset.value);
    });
  };

  bindSeg('lang-seg', (value) => applySettings({ language: value }));

  const grainToggle = $('grain');
  grainToggle?.addEventListener('change', () =>
    applySettings({ grain: grainToggle.checked })
  );

  document.querySelectorAll('.src-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  /* ------------------------------- sources -------------------------------- */

  const dropzone = $('dropzone');
  const fileInput = $('file-input');
  let importing = false;

  const handleFiles = async (fileList) => {
    if (importing) return;
    const files = Array.from(fileList || []).filter(
      (file) => file && file.type && file.type.startsWith('image/')
    );
    if (!files.length) {
      notify(t('toast.noImages'));
      return;
    }

    importing = true;
    dropzone?.classList.add('is-busy');
    notify(t('toast.adding', { n: files.length }), 60000);

    try {
      const { added, failed } = await library.addFiles(files);
      if (added) {
        settings.source = 'library';
        persist();
        syncControls();
        refreshLibraryUI();
        resetCamera();
            renderWall();
        notify(
          failed
            ? t('toast.addedSkipped', { n: added, failed })
            : t('toast.added', { n: added })
        );
      } else {
        notify(t('toast.couldNotRead'));
      }
    } catch (err) {
      console.warn('[lattice] import failed', err);
      notify(t('toast.importFailed'));
    } finally {
      importing = false;
      dropzone?.classList.remove('is-busy');
      if (fileInput) fileInput.value = '';
    }
  };

  fileInput?.addEventListener('change', () => handleFiles(fileInput.files));

  dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });

  ['dragenter', 'dragover'].forEach((type) => {
    dropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-drag');
    });
  });

  ['dragleave', 'dragend'].forEach((type) => {
    dropzone?.addEventListener(type, () => dropzone.classList.remove('is-drag'));
  });

  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.remove('is-drag');
    handleFiles(event.dataTransfer?.files);
  });

  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    if (!event.dataTransfer?.files?.length) return;
    if (event.target.closest('#dropzone')) return;
    setDrawer(true, 'upload');
    handleFiles(event.dataTransfer.files);
  });

  const urlForm = $('url-form');
  const urlInput = $('url-input');

  urlForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = urlInput?.value.trim();
    if (!value) return;

    const submit = urlForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;

    try {
      await library.addUrl(value);
      settings.source = 'library';
      persist();
      syncControls();
      refreshLibraryUI();
      resetCamera();
        renderWall();
      if (urlInput) urlInput.value = '';
      notify(t('toast.urlAdded'));
    } catch (err) {
      const key = err && err.code ? `error.${err.code}` : 'error.load-failed';
      notify(t(key), 2800);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  clearBtn?.addEventListener('click', async () => {
    if (!window.confirm(t('toast.confirmClear'))) return;
    await library.clear();
    await afterLibraryChange(t('toast.libraryCleared'));
  });

  const buildChips = () => {
    if (!collectionsEl) return;
    collectionsEl.replaceChildren(
      ...library.curatedList().map((set) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.collection = set.id;
        chip.dataset.count = String(set.count);
        chip.style.setProperty('--chip-color', set.color);
        chip.textContent = `${setLabel(set.id)} · ${set.count}`;
        chip.addEventListener('click', () => {
          settings.source = 'curated';
          settings.collection = set.id;
          wallSeed = Math.floor(Math.random() * 1e6);
          persist();
          syncControls();
          resetCamera();
                renderWall();
          notify(t('toast.collection', { name: setLabel(set.id) }));
        });
        return chip;
      })
    );
  };

  /* ---------------------------- drawer actions ---------------------------- */

  settingsBtn?.addEventListener('click', () => setDrawer(true));
  closeBtn?.addEventListener('click', () => setDrawer(false));
  scrim?.addEventListener('click', () => setDrawer(false));
  $('done-btn')?.addEventListener('click', () => setDrawer(false));

  $('reset-btn')?.addEventListener('click', () => {
    const source = library.counts().total ? 'library' : 'curated';
    settings = {
      ...DEFAULTS,
      source,
      collection: currentCollection(),
      language: settings.language,
    };
    applySettings({}, { immediateSave: true });
    refreshLibraryUI();
    resetCamera();
    renderWall();
    notify(t('toast.layoutReset'));
  });

  /* ------------------------------- keyboard ------------------------------- */

  const shuffleWall = () => {
    wallSeed = Math.floor(Math.random() * 1e6);
    resetCamera();
    renderWall();
    notify(t('toast.shuffled'));
  };

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.matches('input, select, textarea') || target.isContentEditable);

    if (event.key === 'Escape') {
      if (isDrawerOpen()) setDrawer(false);
      else if (typing) target.blur();
      else engine.collapse();
      return;
    }

    if (isDrawerOpen() || typing) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key.toLowerCase() === 's') shuffleWall();
  });

  /* --------------------------------- boot --------------------------------- */

  const sanitize = (saved) => {
    const clean = { ...DEFAULTS };
    if (!saved || typeof saved !== 'object') return clean;

    for (const [key, fallback] of Object.entries(DEFAULTS)) {
      if (!(key in saved)) continue;
      const value = saved[key];

      if (key in RANGES) {
        const [min, max] = RANGES[key];
        const num = Number(value);
        if (Number.isFinite(num)) clean[key] = Math.min(max, Math.max(min, Math.round(num)));
      } else if (typeof fallback === 'boolean') {
        clean[key] = Boolean(value);
      } else if (key === 'source') {
        if (['library', 'curated'].includes(value)) clean[key] = value;
      } else if (key === 'collection') {
        const known = library.curatedList().map((set) => set.id);
        if (known.includes(value)) clean[key] = value;
      } else if (key === 'language') {
        if (['auto', 'en', 'zh'].includes(value)) clean[key] = value;
      }
    }
    return clean;
  };

  const boot = async () => {
    try {
      const [saved] = await Promise.all([store.get(SETTINGS_KEY), library.load()]);
      settings = sanitize(saved);
      if (settings.source === 'library' && library.counts().total === 0) {
        settings.source = 'curated';
      }

      buildChips();
      syncControls();
      refreshLibraryUI();
      applyCamera();
        renderWall();
    } catch (err) {
      console.error('[lattice] boot failed', err);
      notify(t('toast.bootFailed'));
    }
  };

  boot();
})();
