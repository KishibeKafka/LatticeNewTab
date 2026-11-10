/**
 * app.js — endless wall, panning, in-place photo focus and the settings drawer.
 * Wall generation lives in collage.js, photo storage in library.js.
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
    density: 24,
    tilt: 3,
    gap: 8,
    radius: 12,
    dim: 0,
    blur: 0,
    grain: false,
    source: 'curated',
    collection: 'classic',
    language: 'auto',
  };

  const RANGES = {
    density: [6, 90],
    tilt: [0, 8],
    gap: [0, 40],
    radius: [4, 20],
    dim: [0, 90],
    blur: [0, 18],
  };

  /** Sliders that change the generated wall (everything else is pure CSS). */
  const WALL_KEYS = new Set(['density', 'tilt', 'gap']);

  const DELETE_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  let settings = { ...DEFAULTS };
  let wallSeed = Math.floor(Math.random() * 1e6);
  let toastTimer = 0;
  let appliedLanguage = null;
  let wallTimer = 0;

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

  /* ------------------------------- wall ---------------------------------- */

  const currentCollection = () => settings.collection || 'classic';
  const setLabel = (id) => t(`set.${id}.label`);

  const decorate = (items, label) =>
    items.map((item) => ({
      ...item,
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
    engine.render({
      images: decorate(pool, label),
      count: settings.density,
      tilt: settings.tilt,
      gap: settings.gap,
      seed: wallSeed,
    });
  };

  const scheduleWall = () => {
    clearTimeout(wallTimer);
    wallTimer = setTimeout(renderWall, 110);
  };

  /* -------------------------------- pan ---------------------------------- */

  const collageEl = $('collage');

  let pan = { x: 0, y: 0 };
  let velocity = { x: 0, y: 0 };
  let drag = null;
  let panFrame = 0;

  const applyPan = () => engine.setPan(pan.x, pan.y);

  const resetPan = () => {
    cancelAnimationFrame(panFrame);
    velocity = { x: 0, y: 0 };
    pan = { x: 0, y: 0 };
    applyPan();
  };

  const startInertia = () => {
    cancelAnimationFrame(panFrame);
    panFrame = requestAnimationFrame(function step() {
      velocity.x *= 0.94;
      velocity.y *= 0.94;
      pan.x += velocity.x * 16;
      pan.y += velocity.y * 16;
      applyPan();
      if (Math.hypot(velocity.x, velocity.y) > 0.015) {
        panFrame = requestAnimationFrame(step);
      }
    });
  };

  collageEl?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || focusCard) return;
    cancelAnimationFrame(panFrame);
    velocity = { x: 0, y: 0 };
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
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

    pan.x = drag.originX + dx;
    pan.y = drag.originY + dy;
    applyPan();
  });

  const endPan = (event) => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const { moved, tile } = drag;
    drag = null;
    document.body.classList.remove('is-panning');

    if (!moved && tile) {
      focusTile(tile);
      return;
    }
    if (Math.hypot(velocity.x, velocity.y) > 0.06) startInertia();
  };

  collageEl?.addEventListener('pointerup', endPan);
  collageEl?.addEventListener('pointercancel', endPan);

  /* ------------------------------ focus ---------------------------------- */

  const focusEl = $('focus');
  const focusScrim = $('focus-scrim');
  let focusCard = null;
  let focusOrigin = null;
  let focusTimer = 0;

  const ariaFor = (label) =>
    label ? `${t('lightbox.open')} · ${label}` : t('lightbox.open');

  const animateCard = (card, to, duration = 560) => {
    const from = card.getBoundingClientRect();
    card.getAnimations().forEach((animation) => animation.cancel());
    card.style.left = `${to.left}px`;
    card.style.top = `${to.top}px`;
    card.style.width = `${to.width}px`;
    card.style.height = `${to.height}px`;
    return card.animate(
      [
        {
          left: `${from.left}px`,
          top: `${from.top}px`,
          width: `${from.width}px`,
          height: `${from.height}px`,
        },
        {
          left: `${to.left}px`,
          top: `${to.top}px`,
          width: `${to.width}px`,
          height: `${to.height}px`,
        },
      ],
      { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both' }
    );
  };

  const focusTile = (tile) => {
    if (focusCard || !tile) return;

    clearTimeout(focusTimer);
    const rect = tile.getBoundingClientRect();
    const width = tile.offsetWidth;
    const height = tile.offsetHeight;
    const aspect = width / height || 1;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let targetW = vw * 0.78;
    let targetH = targetW / aspect;
    if (targetH > vh * 0.82) {
      targetH = vh * 0.82;
      targetW = targetH * aspect;
    }

    const card = document.createElement('figure');
    card.className = 'focus__card';
    card.tabIndex = -1;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', t('focus.close'));

    const img = document.createElement('img');
    img.src = tile.dataset.src;
    img.alt = '';
    img.draggable = false;
    card.appendChild(img);

    card.style.left = `${rect.left + (rect.width - width) / 2}px`;
    card.style.top = `${rect.top + (rect.height - height) / 2}px`;
    card.style.width = `${width}px`;
    card.style.height = `${height}px`;

    card.addEventListener('click', () => closeFocus());

    focusEl.appendChild(card);
    focusEl.hidden = false;
    tile.classList.add('is-focus-origin');
    document.body.classList.add('has-focus');

    focusCard = card;
    focusOrigin = tile;

    animateCard(card, {
      left: (vw - targetW) / 2,
      top: (vh - targetH) / 2,
      width: targetW,
      height: targetH,
    });

    requestAnimationFrame(() => focusEl.classList.add('is-open'));
    card.focus({ preventScroll: true });
  };

  const closeFocus = () => {
    if (!focusCard || !focusOrigin) return;

    const card = focusCard;
    const tile = focusOrigin;
    focusCard = null;
    focusOrigin = null;

    const rect = tile.getBoundingClientRect();
    const tw = tile.offsetWidth;
    const th = tile.offsetHeight;

    animateCard(card, {
      left: rect.left + (rect.width - tw) / 2,
      top: rect.top + (rect.height - th) / 2,
      width: tw,
      height: th,
    });

    focusEl.classList.remove('is-open');
    tile.classList.remove('is-focus-origin');
    document.body.classList.remove('has-focus');

    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => {
      if (document.body.classList.contains('has-focus')) return;
      focusEl.hidden = true;
      card.remove();
    }, 620);

    if (tile.isConnected) tile.focus({ preventScroll: true });
  };

  focusScrim?.addEventListener('click', () => closeFocus());

  let focusResize = 0;
  window.addEventListener('resize', () => {
    clearTimeout(focusResize);
    focusResize = setTimeout(() => {
      if (focusCard) closeFocus();
    }, 120);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!focusCard) return;
    if (focusEl.contains(event.target)) return;
    closeFocus();
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
    resetPan();
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
    density: (v) => t('unit.tiles', { n: v }),
    tilt: (v) => t('unit.deg', { n: Number(v).toFixed(1) }),
    gap: (v) => t('unit.px', { n: v }),
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
      tile.setAttribute('aria-label', ariaFor(tile.dataset.label));
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

    root.style.setProperty('--tile-radius', `${settings.radius}px`);
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

    syncSeg('radius-seg', settings.radius);
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
    if (languageChanged) refreshLibraryUI();
    if (options.wall) scheduleWall();
    if (options.save !== false) persist(options.immediateSave);
  };

  /* --------------------------- control bindings --------------------------- */

  for (const id of Object.keys(RANGES)) {
    const input = $(id);
    if (!input) continue;
    setRangeFill(input);
    input.addEventListener('input', () => {
      setRangeFill(input);
      applySettings({ [id]: Number(input.value) }, { wall: WALL_KEYS.has(id) });
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

  bindSeg('radius-seg', (value) => applySettings({ radius: Number(value) }, { wall: false }));
  bindSeg('lang-seg', (value) => applySettings({ language: value }, { wall: false }));

  const grainToggle = $('grain');
  grainToggle?.addEventListener('change', () =>
    applySettings({ grain: grainToggle.checked }, { wall: false })
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
        resetPan();
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
      resetPan();
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
          resetPan();
          syncControls();
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
    wallSeed = Math.floor(Math.random() * 1e6);
    resetPan();
    applySettings({}, { immediateSave: true, wall: true });
    refreshLibraryUI();
    notify(t('toast.layoutReset'));
  });

  /* ------------------------------- keyboard ------------------------------- */

  const shuffleWall = () => {
    wallSeed = Math.floor(Math.random() * 1e6);
    resetPan();
    renderWall();
    notify(t('toast.shuffled'));
  };

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.matches('input, select, textarea') || target.isContentEditable);

    if (event.key === 'Escape') {
      if (focusCard) closeFocus();
      else if (isDrawerOpen()) setDrawer(false);
      else if (typing) target.blur();
      return;
    }

    if (focusCard || isDrawerOpen() || typing) return;
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
      applyPan();
      renderWall();
    } catch (err) {
      console.error('[lattice] boot failed', err);
      notify(t('toast.bootFailed'));
    }
  };

  boot();
})();
