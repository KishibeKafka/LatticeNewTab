/**
 * app.js — HUD shell: clock, search, settings drawer, persistence.
 * The wall itself lives in collage.js.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const NUMERIC = new Set(['density', 'tilt', 'gap', 'radius', 'dim', 'blur']);

  /* ------------------------------ defaults ------------------------------- */

  const DEFAULTS = {
    density: 32,
    tilt: 2,
    gap: 14,
    radius: 10,
    shape: 'mixed',
    dim: 55,
    blur: 3,
    grain: true,
    tone: 'dark',
    clock24: true,
    seconds: true,
    greeting: true,
    engine: 'google',
  };

  const ENGINES = {
    google: { label: 'Google', url: 'https://www.google.com/search?q=' },
    bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
    duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  };

  let settings = { ...DEFAULTS };

  /* ------------------------------ storage -------------------------------- */

  const HAS_CHROME_STORAGE =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  const store = {
    async get(key) {
      try {
        if (HAS_CHROME_STORAGE) {
          const bag = await chrome.storage.local.get(key);
          return bag ? bag[key] : undefined;
        }
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : undefined;
      } catch (err) {
        console.warn('[lattice] read failed', err);
        return undefined;
      }
    },
    async set(key, value) {
      try {
        if (HAS_CHROME_STORAGE) {
          await chrome.storage.local.set({ [key]: value });
          return;
        }
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        console.warn('[lattice] write failed', err);
      }
    },
  };

  let saveTimer = 0;
  const persist = (immediate = false) => {
    clearTimeout(saveTimer);
    const commit = () => store.set('lattice:settings', { ...settings });
    if (immediate) commit();
    else saveTimer = setTimeout(commit, 260);
  };

  /* ------------------------------- toast --------------------------------- */

  const toast = $('toast');
  let toastTimer = 0;
  const notify = (message, ms = 1900) => {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => {
        if (!toast.classList.contains('is-visible')) toast.hidden = true;
      }, 320);
    }, ms);
  };

  /* -------------------------------- clock -------------------------------- */

  const timeEl = $('clock-time');
  const secondsEl = $('clock-seconds');
  const meridiemEl = $('clock-meridiem');
  const dateEl = $('date-line');
  const weekEl = $('week-line');
  const greetingEl = $('greeting');

  const dateFmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const isoWeek = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  };

  const greet = (hour) => {
    if (hour < 5) return 'Still up';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    if (hour < 23) return 'Good evening';
    return 'Good night';
  };

  let lastRenderedMinute = -1;

  const paintClock = (now = new Date()) => {
    const hour24 = now.getHours();
    const minute = now.getMinutes();
    const second = now.getSeconds();

    let hour = hour24;
    let meridiem = '';
    if (!settings.clock24) {
      meridiem = hour24 < 12 ? 'AM' : 'PM';
      hour = hour24 % 12 || 12;
    }

    if (timeEl) {
      timeEl.textContent = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
    if (secondsEl) secondsEl.textContent = String(second).padStart(2, '0');

    if (meridiemEl) {
      meridiemEl.textContent = meridiem;
      meridiemEl.hidden = !meridiem;
    }

    // Date/greeting only need updating once a minute.
    if (minute !== lastRenderedMinute) {
      lastRenderedMinute = minute;
      if (dateEl) dateEl.textContent = dateFmt.format(now);
      if (weekEl) weekEl.textContent = `Week ${isoWeek(now)}`;
      if (greetingEl) {
        greetingEl.textContent = greet(hour24);
        greetingEl.dataset.visible = String(settings.greeting);
      }
    }
  };

  const scheduleTick = () => {
    paintClock();
    // Re-align to the top of every second so the counter never drifts.
    setTimeout(scheduleTick, 1000 - (Date.now() % 1000) + 8);
  };

  /* ----------------------------- search form ----------------------------- */

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
    if (looksLikeUrl(value)) {
      const target = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
      window.location.href = target;
      return;
    }
    const engine = ENGINES[settings.engine] || ENGINES.google;
    window.location.href = engine.url + encodeURIComponent(value);
  };

  /* ------------------------------- drawer -------------------------------- */

  const drawer = $('drawer');
  const scrim = $('scrim');
  const fab = $('open-settings');
  const hud = $('hud');
  const closeBtn = $('close-settings');

  const setDrawer = (open) => {
    document.body.classList.toggle('is-drawer-open', open);
    fab?.setAttribute('aria-expanded', String(open));
    drawer?.setAttribute('aria-hidden', String(!open));
    if (hud) hud.inert = open;
    if (open) {
      closeBtn?.focus({ preventScroll: true });
    } else if (document.activeElement && drawer.contains(document.activeElement)) {
      fab?.focus({ preventScroll: true });
    }
  };

  /* ------------------------------ controls ------------------------------- */

  const rangeIds = ['density', 'tilt', 'gap', 'dim', 'blur'];

  const setRangeFill = (input) => {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  };

  const syncSeg = (container, value) => {
    if (!container) return;
    container.querySelectorAll('button[data-value]').forEach((btn) => {
      const active = String(btn.dataset.value) === String(value);
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  };

  const renderWall = () => {
    window.LatticeCollage?.render({
      count: settings.density,
      tilt: settings.tilt,
      gap: settings.gap,
      radius: settings.radius,
      shape: settings.shape,
    });
  };

  let wallRaf = 0;
  const scheduleWall = () => {
    cancelAnimationFrame(wallRaf);
    wallRaf = requestAnimationFrame(renderWall);
  };

  const applySettings = (partial = {}, options = {}) => {
    settings = { ...settings, ...partial };
    const root = document.documentElement;

    root.style.setProperty('--tile-radius', `${settings.radius}px`);
    root.style.setProperty('--tile-gap', `${settings.gap}px`);
    root.style.setProperty('--tilt-max', `${settings.tilt}deg`);
    root.style.setProperty('--bg-blur', `${settings.blur}px`);
    root.style.setProperty('--dim', String(settings.dim / 100));
    root.style.setProperty('--grain-opacity', settings.grain ? '0.05' : '0');
    root.dataset.tone = settings.tone;

    // sliders
    for (const id of rangeIds) {
      const input = $(id);
      if (!input) continue;
      input.value = String(settings[id]);
      setRangeFill(input);
      const out = $(`${id}-out`);
      if (!out) continue;
      if (id === 'density') out.textContent = `${settings.density} tiles`;
      else if (id === 'tilt') out.textContent = `${Number(settings.tilt).toFixed(1)}°`;
      else if (id === 'gap') out.textContent = `${settings.gap} px`;
      else if (id === 'dim') out.textContent = `${settings.dim}%`;
      else if (id === 'blur') out.textContent = `${settings.blur} px`;
    }

    syncSeg($('radius-seg'), settings.radius);
    syncSeg($('shape-seg'), settings.shape);
    syncSeg($('engine-seg'), settings.engine);

    const grainToggle = $('grain');
    if (grainToggle) grainToggle.checked = settings.grain;
    const toneToggle = $('tone');
    if (toneToggle) toneToggle.checked = settings.tone === 'light';
    const clock24Toggle = $('clock-24');
    if (clock24Toggle) clock24Toggle.checked = settings.clock24;
    const secondsToggle = $('clock-seconds-toggle');
    if (secondsToggle) secondsToggle.checked = settings.seconds;
    const greetingToggle = $('greeting-toggle');
    if (greetingToggle) greetingToggle.checked = settings.greeting;

    if (secondsEl) secondsEl.hidden = !settings.seconds;
    if (greetingEl) greetingEl.dataset.visible = String(settings.greeting);

    if (engineSelect) engineSelect.value = settings.engine;
    if (engineLabel) engineLabel.textContent = (ENGINES[settings.engine] || ENGINES.google).label;

    const countEl = $('source-count');
    const poolSize = window.LatticeCollage?.poolSize?.();
    if (countEl && poolSize) {
      countEl.textContent = `${poolSize} image${poolSize === 1 ? '' : 's'}`;
    }

    lastRenderedMinute = -1;
    paintClock();

    if (options.rerender !== false) scheduleWall();
    if (options.save !== false) persist(options.immediateSave);
  };

  /* ----------------------------- wiring: UI ------------------------------ */

  for (const id of rangeIds) {
    const input = $(id);
    if (!input) continue;
    setRangeFill(input);
    input.addEventListener('input', () => {
      const value = Number(input.value);
      setRangeFill(input);
      applySettings({ [id]: value });
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
  bindToggle('tone', (checked) => applySettings({ tone: checked ? 'light' : 'dark' }));
  bindToggle('clock-24', (checked) => applySettings({ clock24: checked }));
  bindToggle('clock-seconds-toggle', (checked) => applySettings({ seconds: checked }));
  bindToggle('greeting-toggle', (checked) => applySettings({ greeting: checked }));

  engineSelect?.addEventListener('change', () => applySettings({ engine: engineSelect.value }));

  /* source tabs */
  document.querySelectorAll('.src-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.src-tab').forEach((t) => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('.src-panel').forEach((panel) => {
        const active = panel.dataset.panel === tab.dataset.tab;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    });
  });

  /* search */
  searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitSearch(searchInput?.value ?? '');
  });

  /* drawer triggers */
  fab?.addEventListener('click', () => setDrawer(true));
  closeBtn?.addEventListener('click', () => setDrawer(false));
  scrim?.addEventListener('click', () => setDrawer(false));
  $('done-btn')?.addEventListener('click', () => setDrawer(false));

  $('reset-btn')?.addEventListener('click', () => {
    settings = { ...DEFAULTS };
    applySettings({}, { immediateSave: true });
    notify('Wall reset to defaults');
  });

  $('shuffle-btn')?.addEventListener('click', () => {
    window.LatticeCollage?.shuffle();
    notify('Wall shuffled');
  });

  /* ---------------------------- keyboard --------------------------------- */

  document.addEventListener('keydown', (event) => {
    const typing =
      event.target instanceof HTMLElement &&
      (event.target.matches('input, select, textarea') || event.target.isContentEditable);

    if (event.key === 'Escape') {
      if (document.body.classList.contains('is-drawer-open')) {
        setDrawer(false);
      } else if (typing) {
        event.target.blur();
      }
      return;
    }

    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === '/') {
      event.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    } else if (event.key.toLowerCase() === 's') {
      window.LatticeCollage?.shuffle();
      notify('Wall shuffled');
    }
  });

  /* ------------------------------- boot --------------------------------- */

  const boot = async () => {
    const saved = await store.get('lattice:settings');
    if (saved && typeof saved === 'object') {
      const clean = {};
      for (const [key, value] of Object.entries(saved)) {
        if (!(key in DEFAULTS)) continue;
        clean[key] = NUMERIC.has(key) ? clamp(Number(value) || 0, 0, 999) : value;
      }
      settings = { ...DEFAULTS, ...clean };
    }
    applySettings({}, { save: false });
    scheduleTick();
  };

  boot();
})();
