/**
 * app.js — HUD + customize drawer wiring.
 * Wall rendering lives in collage.js, photo storage in library.js.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const store = window.LatticeStore;
  const library = window.LatticeLibrary;
  const engine = window.LatticeCollage;

  const SETTINGS_KEY = 'lattice:settings';

  const DEFAULTS = {
    density: 24,
    tilt: 2,
    gap: 12,
    radius: 12,
    shape: 'mixed',
    dim: 26,
    blur: 1,
    grain: false,
    clock24: true,
    seconds: false,
    greeting: false,
    engine: 'google',
    source: 'curated',
    collection: 'classic',
  };

  const RANGES = {
    density: [6, 90],
    tilt: [0, 8],
    gap: [0, 40],
    radius: [4, 20],
    dim: [0, 90],
    blur: [0, 18],
  };

  const ENGINES = {
    google: { label: 'Google', url: 'https://www.google.com/search?q=' },
    bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
    duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  };

  const DELETE_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  let settings = { ...DEFAULTS };
  let wallSeed = Math.floor(Math.random() * 1e6);
  let toastTimer = 0;

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

  /* -------------------------------- clock -------------------------------- */

  const timeEl = $('clock-time');
  const secondsEl = $('clock-seconds');
  const meridiemEl = $('clock-meridiem');
  const dateEl = $('date-line');
  const greetingEl = $('greeting');

  const dateFmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const greet = (hour) => {
    if (hour < 5) return 'Still up';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    if (hour < 23) return 'Good evening';
    return 'Good night';
  };

  let lastMinute = -1;

  const paintClock = (now = new Date()) => {
    const hour24 = now.getHours();
    const minute = now.getMinutes();

    let hour = hour24;
    let meridiem = '';
    if (!settings.clock24) {
      meridiem = hour24 < 12 ? 'AM' : 'PM';
      hour = hour24 % 12 || 12;
    }

    const hourText = settings.clock24 ? String(hour).padStart(2, '0') : String(hour);
    if (timeEl) timeEl.textContent = `${hourText}:${String(minute).padStart(2, '0')}`;
    if (secondsEl) secondsEl.textContent = String(now.getSeconds()).padStart(2, '0');
    if (meridiemEl) {
      meridiemEl.textContent = meridiem;
      meridiemEl.hidden = !meridiem;
    }

    if (minute !== lastMinute) {
      lastMinute = minute;
      if (dateEl) dateEl.textContent = dateFmt.format(now);
      if (greetingEl) greetingEl.textContent = greet(hour24);
    }
  };

  const scheduleTick = () => {
    paintClock();
    setTimeout(scheduleTick, 1000 - (Date.now() % 1000) + 8);
  };

  /* ------------------------------- search -------------------------------- */

  const searchForm = $('search-form');
  const searchInput = $('search-input');
  const engineSelect = $('engine-select');
  const engineLabel = $('engine-label');

  const looksLikeUrl = (value) => {
    if (/\s/.test(value) || !value.includes('.')) return false;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#].*)?$/i.test(value);
  };

  const submitSearch = (rawValue) => {
    const value = rawValue.trim();
    if (!value) return;
    if (/^https?:\/\//i.test(value)) {
      window.location.href = value;
      return;
    }
    if (looksLikeUrl(value)) {
      window.location.href = `https://${value}`;
      return;
    }
    const selected = ENGINES[settings.engine] || ENGINES.google;
    window.location.href = selected.url + encodeURIComponent(value);
  };

  /* ------------------------------- drawer -------------------------------- */

  const drawer = $('drawer');
  const scrim = $('scrim');
  const hud = $('hud');
  const closeBtn = $('close-settings');
  const openBtn = $('open-settings');
  const pillBtn = $('customize-pill');

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

  const setDrawer = (open, tab) => {
    document.body.classList.toggle('is-drawer-open', open);
    openBtn?.setAttribute('aria-expanded', String(open));
    drawer?.setAttribute('aria-hidden', String(!open));
    if (hud) hud.inert = open;
    if (open) {
      if (tab) activateTab(tab);
      drawer?.focus({ preventScroll: true });
    } else if (document.activeElement && drawer.contains(document.activeElement)) {
      pillBtn?.focus({ preventScroll: true });
    }
  };

  /* ------------------------------- wall ---------------------------------- */

  const wallMeta = $('wall-meta');
  const credit = $('credit');
  const sourceCount = $('source-count');

  const currentCollection = () => settings.collection || 'editorial';

  const poolFor = () => {
    const localPool = library.pool();
    if (settings.source === 'library' && localPool.length) {
      return { pool: localPool, label: 'your library', isLibrary: true };
    }
    return {
      pool: library.curatedPool(currentCollection()),
      label: library.curatedLabel(currentCollection()),
      isLibrary: false,
      isLocalSet: currentCollection() === 'classic',
    };
  };

  const renderWall = () => {
    const { pool, label, isLibrary, isLocalSet } = poolFor();
    const tiles = engine.render({
      images: pool,
      count: settings.density,
      tilt: settings.tilt,
      gap: settings.gap,
      shape: settings.shape,
      seed: wallSeed,
    });

    if (wallMeta) wallMeta.textContent = `${tiles} tiles · ${label}`;
    if (credit) {
      if (isLibrary) credit.textContent = 'Photos from your library';
      else if (isLocalSet) credit.textContent = 'Classic set · bundled offline';
      else credit.textContent = 'Curated from picsum.photos';
    }
  };

  let wallRaf = 0;
  const scheduleRender = () => {
    cancelAnimationFrame(wallRaf);
    wallRaf = requestAnimationFrame(renderWall);
  };

  /* --------------------------- library drawer UI -------------------------- */

  const thumbsEl = $('thumbs');
  const urlThumbsEl = $('url-thumbs');
  const clearBtn = $('clear-library');

  const buildThumb = (item) => {
    const figure = document.createElement('figure');
    figure.className = 'thumb';

    const img = document.createElement('img');
    img.alt = item.name || 'Photo';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = library.thumbFor(item);
    figure.appendChild(img);

    const remove = document.createElement('button');
    remove.className = 'thumb__remove';
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${item.name || 'photo'}`);
    remove.innerHTML = DELETE_ICON;
    remove.addEventListener('click', async () => {
      await library.remove(item.id);
      await afterLibraryChange(`${item.name || 'Photo'} removed`);
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
    if (settings.source === 'library') {
      const total = library.counts().total;
      sourceCount.textContent = `${total} photo${total === 1 ? '' : 's'}`;
    } else {
      const total = library.curatedCount(currentCollection());
      sourceCount.textContent = `${total} photos`;
    }
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
    density: (v) => `${v} photos`,
    tilt: (v) => `${Number(v).toFixed(1)}°`,
    gap: (v) => `${v} px`,
    dim: (v) => `${v}%`,
    blur: (v) => `${v} px`,
  };

  const syncControls = () => {
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
    syncSeg('shape-seg', settings.shape);
    syncSeg('engine-seg', settings.engine);

    const grainToggle = $('grain');
    if (grainToggle) grainToggle.checked = settings.grain;
    const clock24Toggle = $('clock-24');
    if (clock24Toggle) clock24Toggle.checked = settings.clock24;
    const secondsToggle = $('clock-seconds-toggle');
    if (secondsToggle) secondsToggle.checked = settings.seconds;
    const greetingToggle = $('greeting-toggle');
    if (greetingToggle) greetingToggle.checked = settings.greeting;

    if (secondsEl) secondsEl.hidden = !settings.seconds;
    if (greetingEl) greetingEl.dataset.visible = String(settings.greeting);

    const engineMeta = ENGINES[settings.engine] || ENGINES.google;
    if (engineSelect) engineSelect.value = settings.engine;
    if (engineLabel) engineLabel.textContent = engineMeta.label;
    if (searchInput) searchInput.placeholder = `Search ${engineMeta.label} or type a URL`;

    document.querySelectorAll('.chip[data-collection]').forEach((chip) => {
      chip.classList.toggle(
        'is-active',
        settings.source === 'curated' && chip.dataset.collection === currentCollection()
      );
    });

    lastMinute = -1;
    paintClock();
  };

  const applySettings = (partial = {}, options = {}) => {
    settings = { ...settings, ...partial };
    syncControls();
    updateSourceCount();
    if (options.rerender !== false) scheduleRender();
    if (options.save !== false) persist(options.immediateSave);
  };

  /* --------------------------- control bindings --------------------------- */

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

  bindSeg('radius-seg', (value) => applySettings({ radius: Number(value) }));
  bindSeg('shape-seg', (value) => applySettings({ shape: value }));
  bindSeg('engine-seg', (value) => applySettings({ engine: value }));

  const bindToggle = (id, onChange) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener('change', () => onChange(input.checked));
  };

  bindToggle('grain', (checked) => applySettings({ grain: checked }));
  bindToggle('clock-24', (checked) => applySettings({ clock24: checked }));
  bindToggle('clock-seconds-toggle', (checked) => applySettings({ seconds: checked }));
  bindToggle('greeting-toggle', (checked) => applySettings({ greeting: checked }));

  engineSelect?.addEventListener('change', () => applySettings({ engine: engineSelect.value }));

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
      notify('No images in that selection');
      return;
    }

    importing = true;
    dropzone?.classList.add('is-busy');
    notify(`Adding ${files.length} photo${files.length === 1 ? '' : 's'}…`, 60000);

    try {
      const { added, failed } = await library.addFiles(files);
      if (added) {
        settings.source = 'library';
        persist();
        syncControls();
        refreshLibraryUI();
        renderWall();
        notify(
          `Added ${added} photo${added === 1 ? '' : 's'}${
            failed ? ` · ${failed} skipped` : ''
          }`
        );
      } else {
        notify('Could not read those images');
      }
    } catch (err) {
      console.warn('[lattice] import failed', err);
      notify('Could not add those photos');
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
      renderWall();
      if (urlInput) urlInput.value = '';
      notify('Image added to your wall');
    } catch (err) {
      notify(err.message || 'Could not add that image', 2800);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  clearBtn?.addEventListener('click', async () => {
    if (!window.confirm('Remove every photo from your library?')) return;
    await library.clear();
    await afterLibraryChange('Library cleared');
  });

  /* curated chips */
  const collectionsEl = $('collections');

  const buildChips = () => {
    if (!collectionsEl) return;
    collectionsEl.replaceChildren(
      ...library.curatedList().map((set) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.collection = set.id;
        chip.style.setProperty('--chip-color', set.color);
        chip.textContent = `${set.label} · ${set.count}`;
        chip.addEventListener('click', () => {
          settings.source = 'curated';
          settings.collection = set.id;
          wallSeed = Math.floor(Math.random() * 1e6);
          persist();
          syncControls();
          updateSourceCount();
          renderWall();
          notify(`${set.label} wall`);
        });
        return chip;
      })
    );
  };

  /* ---------------------------- shortcuts / FAB --------------------------- */

  $('shortcut-shuffle')?.addEventListener('click', () => {
    wallSeed = Math.floor(Math.random() * 1e6);
    renderWall();
    notify('Wall shuffled');
  });

  $('shortcut-upload')?.addEventListener('click', () => setDrawer(true, 'upload'));
  $('shortcut-url')?.addEventListener('click', () => setDrawer(true, 'url'));
  $('shortcut-curated')?.addEventListener('click', () => setDrawer(true, 'curated'));

  openBtn?.addEventListener('click', () => setDrawer(true));
  pillBtn?.addEventListener('click', () => setDrawer(true));
  closeBtn?.addEventListener('click', () => setDrawer(false));
  scrim?.addEventListener('click', () => setDrawer(false));
  $('done-btn')?.addEventListener('click', () => setDrawer(false));

  $('reset-btn')?.addEventListener('click', () => {
    const source = library.counts().total ? 'library' : 'curated';
    settings = { ...DEFAULTS, source, collection: currentCollection() };
    wallSeed = Math.floor(Math.random() * 1e6);
    applySettings({}, { immediateSave: true });
    refreshLibraryUI();
    notify('Layout reset');
  });

  /* -------------------------------- forms --------------------------------- */

  searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitSearch(searchInput?.value ?? '');
  });

  searchForm?.addEventListener('click', (event) => {
    if (event.target.closest('.search__engine')) return;
    searchInput?.focus();
  });

  /* ------------------------------- keyboard ------------------------------- */

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.matches('input, select, textarea') || target.isContentEditable);

    if (event.key === 'Escape') {
      if (document.body.classList.contains('is-drawer-open')) setDrawer(false);
      else if (typing) target.blur();
      return;
    }

    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === '/') {
      event.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    } else if (event.key.toLowerCase() === 's') {
      wallSeed = Math.floor(Math.random() * 1e6);
      renderWall();
      notify('Wall shuffled');
    }
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
      } else if (key === 'engine') {
        if (ENGINES[value]) clean[key] = value;
      } else if (key === 'shape') {
        if (['mixed', 'square', 'portrait'].includes(value)) clean[key] = value;
      } else if (key === 'source') {
        if (['library', 'curated'].includes(value)) clean[key] = value;
      } else if (key === 'collection') {
        const known = library.curatedList().map((set) => set.id);
        if (known.includes(value)) clean[key] = value;
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
      renderWall();
      scheduleTick();
    } catch (err) {
      console.error('[lattice] boot failed', err);
      notify('Something went wrong loading your wall');
    }
  };

  boot();
})();
