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

  const ENGINES = {
    google: { labelKey: 'engine.google', url: 'https://www.google.com/search?q=' },
    bing: { labelKey: 'engine.bing', url: 'https://www.bing.com/search?q=' },
    duckduckgo: { labelKey: 'engine.duckduckgo', url: 'https://duckduckgo.com/?q=' },
    baidu: { labelKey: 'engine.baidu', url: 'https://www.baidu.com/s?wd=' },
  };

  const DEFAULTS = {
    dim: 0,
    blur: 0,
    theme: 'auto',
    engine: 'google',
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
  let shortcutsList = [];
  let shortcutsCustom = false;
  let shortcutsEditing = false;
  let editingShortcutIndex = -1;
  let editingIcon = '';
  let draggedShortcut = -1;
  let suppressShortcutClick = 0;
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
  let requestSearchLayout = () => {};

  const applyCamera = () => {
    engine.setCamera(camera.x, camera.y, camera.scale);
    requestSearchLayout();
  };

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
      else {
        engine.collapse();
        requestSearchLayout();
      }
      return;
    }
    if (Math.hypot(velocity.x, velocity.y) > 0.06) startInertia();
  };

  collageEl?.addEventListener('pointerup', endPan);
  collageEl?.addEventListener('pointercancel', endPan);

  /* ----------------------------- shortcuts -------------------------------- */

  const shortcutsEl = $('shortcuts');
  const shortcutDialog = $('shortcut-dialog');
  const shortcutForm = $('shortcut-form');
  const shortcutName = $('shortcut-name');
  const shortcutUrl = $('shortcut-url');
  const shortcutError = $('shortcut-error');
  const shortcutDelete = $('shortcut-delete');
  const shortcutIconInput = $('shortcut-icon-input');
  const shortcutIconPreview = $('shortcut-icon-preview');
  const shortcutIconReset = $('shortcut-icon-reset');
  const SHORTCUTS_KEY = 'lattice:shortcuts';
  const MAX_SHORTCUTS = 12;
  const SHORTCUT_DRAG_TYPE = 'application/x-lattice-shortcut';
  const shortcutMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let shortcutAnimSeq = 0;

  const isShortcutDrag = (event) =>
    Array.from(event.dataTransfer?.types || []).some(
      (type) => type === SHORTCUT_DRAG_TYPE
    );

  const ICON_EDIT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.2L19 9.2a1.9 1.9 0 0 0 0-2.7l-1.5-1.5a1.9 1.9 0 0 0-2.7 0L4 15.8V20Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m13.9 6.6 3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;
  const ICON_DONE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_PLUS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
  const ICON_X = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;

  const faviconFor = (url) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`);
      }
    } catch (err) {
      /* fall through */
    }
    try {
      const host = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
    } catch (err) {
      return '';
    }
  };

  const hostOf = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (err) {
      return '';
    }
  };

  const sanitizeShortcuts = (list) => {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const clean = [];
    for (const item of list) {
      if (!item || typeof item.url !== 'string') continue;
      if (!/^https?:\/\//i.test(item.url)) continue;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      const icon =
        typeof item.icon === 'string' && /^(data:image\/|https?:\/\/)/i.test(item.icon)
          ? item.icon
          : '';
      const entry = {
        title: String(item.title || hostOf(item.url) || item.url).slice(0, 60),
        url: item.url,
      };
      if (icon) entry.icon = icon;
      clean.push(entry);
      if (clean.length >= MAX_SHORTCUTS) break;
    }
    return clean;
  };

  const persistShortcuts = async () => {
    shortcutsCustom = true;
    await store.set(SHORTCUTS_KEY, shortcutsList);
  };

  const captureShortcutRects = () => {
    const rects = new Map();
    shortcutsEl?.querySelectorAll('.shortcut-wrap[data-shortcut-url]').forEach((el) => {
      rects.set(el.dataset.shortcutUrl, el.getBoundingClientRect());
    });
    return rects;
  };

  const animateShortcutReorder = (before) => {
    if (!before?.size || !shortcutsEl || shortcutMotionQuery.matches) return;
    const after = new Map();
    shortcutsEl.querySelectorAll('.shortcut-wrap[data-shortcut-url]').forEach((el) => {
      after.set(el.dataset.shortcutUrl, el);
    });

    const moving = [];
    for (const [url, oldRect] of before) {
      const el = after.get(url);
      if (!el) continue;
      const newRect = el.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      moving.push(el);
    }
    if (!moving.length) return;

    // commit the inverted positions, then let the browser transition home
    void shortcutsEl.offsetWidth;
    requestAnimationFrame(() => {
      for (const el of moving) {
        el.style.transition = 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform = '';
      }
    });

    const seq = ++shortcutAnimSeq;
    window.setTimeout(() => {
      if (seq !== shortcutAnimSeq) return;
      for (const el of moving) {
        el.style.transition = '';
        el.style.transform = '';
      }
    }, 340);
  };

  const openShortcut = (url) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    window.location.href = url;
  };

  const normaliseUrl = (value) => {
    let candidate = String(value || '').trim();
    if (!candidate) return null;
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return parsed.href;
    } catch (err) {
      return null;
    }
  };

  const makeShortcutButton = (site, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'shortcut-wrap';
    wrapper.dataset.shortcutUrl = site.url;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shortcut';
    button.title = site.title;
    button.setAttribute('aria-label', site.title);

    const tile = document.createElement('span');
    tile.className = 'shortcut__tile';

    const letter = document.createElement('span');
    letter.className = 'shortcut__letter';
    letter.textContent = (site.title || '?').trim().charAt(0).toUpperCase() || '?';

    const icon = document.createElement('img');
    icon.className = 'shortcut__icon';
    icon.alt = '';
    icon.decoding = 'async';
    icon.draggable = false;
    icon.src = site.icon || faviconFor(site.url);
    icon.addEventListener('error', () => icon.remove(), { once: true });

    tile.appendChild(letter);
    tile.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'shortcut__label';
    label.textContent = site.title;

    button.appendChild(tile);
    button.appendChild(label);
    button.addEventListener('click', () => {
      if (Date.now() < suppressShortcutClick) return;
      if (shortcutsEditing) openShortcutDialog(index);
      else openShortcut(site.url);
    });

    wrapper.appendChild(button);

    if (shortcutsEditing) {
      wrapper.draggable = true;
      wrapper.addEventListener('dragstart', (event) => {
        if (!event.dataTransfer) return;
        draggedShortcut = index;
        suppressShortcutClick = Date.now() + 500;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(SHORTCUT_DRAG_TYPE, String(index));
        event.dataTransfer.setData('text/plain', String(index));
        requestAnimationFrame(() => {
          if (draggedShortcut === index) wrapper.classList.add('is-dragging');
        });
      });
      wrapper.addEventListener('dragend', () => {
        wrapper.classList.remove('is-dragging');
        shortcutsEl
          ?.querySelectorAll('.shortcut-wrap.is-drop-target')
          .forEach((el) => el.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after'));
        draggedShortcut = -1;
      });
      wrapper.addEventListener('dragover', (event) => {
        if (draggedShortcut < 0 || !isShortcutDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        shortcutsEl?.querySelectorAll('.shortcut-wrap.is-drop-target').forEach((el) => {
          if (el !== wrapper) {
            el.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after');
          }
        });
        wrapper.classList.add('is-drop-target');
        wrapper.classList.toggle('is-drop-after', draggedShortcut < index);
        wrapper.classList.toggle('is-drop-before', draggedShortcut > index);
      });
      wrapper.addEventListener('dragleave', () =>
        wrapper.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after')
      );
      wrapper.addEventListener('drop', (event) => {
        if (!isShortcutDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        wrapper.classList.remove('is-drop-target');
        const source = Number(
          event.dataTransfer?.getData(SHORTCUT_DRAG_TYPE) ||
            event.dataTransfer?.getData('text/plain')
        );
        if (!Number.isInteger(source) || source === index) {
          draggedShortcut = -1;
          return;
        }
        const before = captureShortcutRects();
        const [moved] = shortcutsList.splice(source, 1);
        // forward drops land after the target, backward drops before it
        shortcutsList.splice(index, 0, moved);
        suppressShortcutClick = Date.now() + 300;
        draggedShortcut = -1;
        void persistShortcuts();
        renderShortcuts();
        animateShortcutReorder(before);
      });
    }

    if (shortcutsEditing) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'shortcut__remove';
      remove.setAttribute('aria-label', t('shortcuts.remove', { name: site.title }));
      remove.innerHTML = ICON_X;
      remove.addEventListener('click', async (event) => {
        event.stopPropagation();
        shortcutsList.splice(index, 1);
        await persistShortcuts();
        renderShortcuts();
      });
      wrapper.appendChild(remove);
    }

    return wrapper;
  };

  const makeActionButton = ({ label, icon, onClick, className = '' }) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'shortcut-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `shortcut shortcut--action ${className}`.trim();
    button.setAttribute('aria-label', label);
    button.title = label;

    const tile = document.createElement('span');
    tile.className = 'shortcut__tile';
    tile.innerHTML = icon;

    const text = document.createElement('span');
    text.className = 'shortcut__label';
    text.textContent = label;

    button.appendChild(tile);
    button.appendChild(text);
    button.addEventListener('click', onClick);
    wrapper.appendChild(button);
    return wrapper;
  };

  const renderShortcuts = () => {
    if (!shortcutsEl) return;

    const items = shortcutsList.map((site, index) => makeShortcutButton(site, index));

    if (shortcutsEditing && shortcutsList.length < MAX_SHORTCUTS) {
      items.push(
        makeActionButton({
          label: t('shortcuts.add'),
          icon: ICON_PLUS,
          onClick: () => openShortcutDialog(-1),
        })
      );
    }

    items.push(
      makeActionButton({
        label: shortcutsEditing ? t('shortcuts.done') : t('shortcuts.edit'),
        icon: shortcutsEditing ? ICON_DONE : ICON_EDIT,
        onClick: toggleShortcutEditing,
      })
    );

    shortcutsEl.replaceChildren(...items);
    shortcutsEl.hidden = false;
    shortcutsEl.classList.toggle('is-editing', shortcutsEditing);
  };

  const toggleShortcutEditing = () => {
    shortcutsEditing = !shortcutsEditing;
    renderShortcuts();
  };

  const openShortcutDialog = (index) => {
    if (!shortcutDialog) return;
    editingShortcutIndex = index;
    const site = index >= 0 ? shortcutsList[index] : null;
    const title = $('shortcut-dialog-title');
    if (title) title.textContent = t(site ? 'shortcuts.editTitle' : 'shortcuts.newTitle');
    if (shortcutName) shortcutName.value = site ? site.title : '';
    if (shortcutUrl) shortcutUrl.value = site ? site.url : '';
    if (shortcutError) shortcutError.hidden = true;
    if (shortcutDelete) shortcutDelete.hidden = !site;
    editingIcon = site && site.icon ? site.icon : '';
    updateIconPreview(editingIcon || (site ? faviconFor(site.url) : ''));
    shortcutDialog.showModal();
    shortcutName?.focus();
  };

  const updateIconPreview = (src) => {
    if (!shortcutIconPreview) return;
    if (src) shortcutIconPreview.src = src;
    else shortcutIconPreview.removeAttribute('src');
  };

  shortcutUrl?.addEventListener('input', () => {
    if (editingIcon) return;
    const url = normaliseUrl(shortcutUrl.value);
    updateIconPreview(url ? faviconFor(url) : '');
  });

  shortcutIconReset?.addEventListener('click', async () => {
    editingIcon = '';
    const url = normaliseUrl(shortcutUrl?.value);
    updateIconPreview(url ? faviconFor(url) : '');
    shortcutIconInput.value = '';
  });

  shortcutIconInput?.addEventListener('change', async () => {
    const file = shortcutIconInput.files && shortcutIconInput.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const scale = Math.min(56 / bitmap.width, 56 / bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.drawImage(bitmap, Math.round((64 - width) / 2), Math.round((64 - height) / 2), width, height);
      bitmap.close();
      editingIcon = canvas.toDataURL('image/png');
      updateIconPreview(editingIcon);
    } catch (err) {
      console.warn('[lattice] icon import failed', err);
    } finally {
      shortcutIconInput.value = '';
    }
  });

  shortcutForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = normaliseUrl(shortcutUrl?.value);
    if (!url) {
      if (shortcutError) shortcutError.hidden = false;
      shortcutUrl?.focus();
      return;
    }
    const title = (shortcutName?.value || '').trim() || hostOf(url) || url;
    const entry = { title: title.slice(0, 60), url };
    if (editingIcon) entry.icon = editingIcon;

    if (editingShortcutIndex >= 0) shortcutsList[editingShortcutIndex] = entry;
    else if (shortcutsList.length < MAX_SHORTCUTS) shortcutsList.push(entry);

    await persistShortcuts();
    shortcutDialog.close();
    renderShortcuts();
  });

  shortcutDelete?.addEventListener('click', async () => {
    if (editingShortcutIndex < 0) return;
    shortcutsList.splice(editingShortcutIndex, 1);
    await persistShortcuts();
    shortcutDialog.close();
    renderShortcuts();
  });

  $('shortcut-cancel')?.addEventListener('click', () => shortcutDialog?.close());
  shortcutDialog?.addEventListener('click', (event) => {
    if (event.target === shortcutDialog) shortcutDialog.close();
  });
  shortcutDialog?.addEventListener('close', () => {
    editingShortcutIndex = -1;
    editingIcon = '';
  });

  /* ------------------------- centre search ------------------------------- */

  const searchEl = $('center-search');
  const searchFormEl = $('center-search-form');
  const searchInputEl = $('center-search-input');
  let searchFrame = 0;

  const scheduleCenterSearch = () => {
    if (searchFrame) return;
    searchFrame = requestAnimationFrame(() => {
      searchFrame = 0;
      layoutCenterSearch();
    });
  };

  const layoutCenterSearch = () => {
    if (!searchEl) return;
    const rect = engine.activeRect ? engine.activeRect() : null;
    if (!rect) {
      searchEl.classList.remove('is-visible');
      searchEl.setAttribute('aria-hidden', 'true');
      return;
    }

    const scale = camera.scale;
    const cardLeft = rect.x * scale + camera.x;
    const cardTop = rect.y * scale + camera.y;
    const cardW = rect.w * scale;
    const cardH = rect.h * scale;
    const cardRight = cardLeft + cardW;
    const cardBottom = cardTop + cardH;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // keep the field floating next to the photo, never over it
    const cx = cardLeft + cardW / 2;
    const cy = cardTop + cardH / 2;
    if (cx < 0 || cx > vw || cy < 0 || cy > vh) {
      searchEl.classList.remove('is-visible');
      searchEl.setAttribute('aria-hidden', 'true');
      return;
    }

    const narrow = vw < 700;
    const barH = narrow ? 44 : 48;
    const barW = Math.min(584, vw - 32);
    const gap = narrow ? 12 : 16;
    const margin = 12;

    let top;
    if (cardTop >= barH + gap + margin) {
      top = cardTop - gap - barH;
    } else if (vh - cardBottom >= barH + gap + margin) {
      top = cardBottom + gap;
    } else {
      top = Math.max(margin, Math.min(vh - barH - margin, cardTop - gap - barH));
    }

    let left = cx - barW / 2;
    left = Math.max(16, Math.min(vw - barW - 16, left));

    searchEl.style.width = `${Math.round(barW)}px`;
    searchEl.style.height = `${barH}px`;
    searchEl.style.left = `${Math.round(left)}px`;
    searchEl.style.top = `${Math.round(top)}px`;
    searchEl.classList.add('is-visible');
    searchEl.removeAttribute('aria-hidden');
  };

  requestSearchLayout = scheduleCenterSearch;

  const looksLikeUrl = (value) => {
    if (/\s/.test(value) || !value.includes('.')) return false;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#].*)?$/i.test(value);
  };

  const submitSearch = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return;
    if (/^https?:\/\//i.test(value)) {
      window.location.href = value;
      return;
    }
    if (looksLikeUrl(value)) {
      window.location.href = `https://${value}`;
      return;
    }
    const engine = ENGINES[settings.engine] || ENGINES.google;
    window.location.href = engine.url + encodeURIComponent(value);
  };

  searchFormEl?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitSearch(searchInputEl?.value);
  });

  searchFormEl?.addEventListener('click', () => {
    searchInputEl?.focus();
  });

  /* ------------------------------- wall ---------------------------------- */

  const THEME_CACHE = 'lattice:theme';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  const applyTheme = () => {
    const preference = settings.theme || 'auto';
    const dark = preference === 'dark' || (preference === 'auto' && systemDark.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_CACHE, preference);
    } catch (err) {
      /* storage may be unavailable */
    }
  };

  systemDark.addEventListener('change', () => {
    if ((settings.theme || 'auto') === 'auto') applyTheme();
  });

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
    else requestSearchLayout();
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

    for (const id of Object.keys(RANGES)) {
      const input = $(id);
      if (!input) continue;
      input.value = String(settings[id]);
      setRangeFill(input);
      const out = $(`${id}-out`);
      if (out && sliderOutput[id]) out.textContent = sliderOutput[id](settings[id]);
    }

    syncSeg('lang-seg', settings.language);
    syncSeg('theme-seg', settings.theme);
    syncSeg('engine-seg', settings.engine);
    applyTheme();

    if (searchInputEl) {
      const engine = ENGINES[settings.engine] || ENGINES.google;
      const placeholderKey =
        settings.engine === 'baidu' && i18n.locale().startsWith('zh')
          ? 'search.placeholderBaidu'
          : 'search.placeholder';
      searchInputEl.placeholder = t(placeholderKey, { engine: t(engine.labelKey) });
      searchInputEl.setAttribute('aria-label', t('search.inputAria'));
    }

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
      renderShortcuts();
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
  bindSeg('theme-seg', (value) => applySettings({ theme: value }));
  bindSeg('engine-seg', (value) => applySettings({ engine: value }));

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
      if (isShortcutDrag(event)) return;
      event.preventDefault();
      dropzone.classList.add('is-drag');
    });
  });

  ['dragleave', 'dragend'].forEach((type) => {
    dropzone?.addEventListener(type, () => dropzone.classList.remove('is-drag'));
  });

  dropzone?.addEventListener('drop', (event) => {
    if (isShortcutDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.remove('is-drag');
    handleFiles(event.dataTransfer?.files);
  });

  window.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!isShortcutDrag(event)) return;
    event.dataTransfer.dropEffect =
      event.target instanceof Element && event.target.closest('.shortcuts')
        ? 'move'
        : 'none';
  });

  window.addEventListener('drop', (event) => {
    event.preventDefault();
    // shortcut reordering is internal; never treat its icon as a photo upload
    if (isShortcutDrag(event)) return;
    if (event.target instanceof Element && event.target.closest('.shortcuts')) return;
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
      engine: settings.engine,
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
      else {
        engine.collapse();
        requestSearchLayout();
      }
      return;
    }

    if (isDrawerOpen() || typing) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === '/') {
      if (searchEl && searchEl.classList.contains('is-visible')) {
        event.preventDefault();
        searchInputEl?.focus();
        searchInputEl?.select();
      }
    } else if (event.key.toLowerCase() === 's') {
      shuffleWall();
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
      } else if (key === 'source') {
        if (['library', 'curated'].includes(value)) clean[key] = value;
      } else if (key === 'collection') {
        const known = library.curatedList().map((set) => set.id);
        if (known.includes(value)) clean[key] = value;
      } else if (key === 'language') {
        if (['auto', 'en', 'zh'].includes(value)) clean[key] = value;
      } else if (key === 'theme') {
        if (['auto', 'light', 'dark'].includes(value)) clean[key] = value;
      } else if (key === 'engine') {
        if (ENGINES[value]) clean[key] = value;
      }
    }
    return clean;
  };

  const boot = async () => {
    try {
      const [saved, , stored, dynamic] = await Promise.all([
        store.get(SETTINGS_KEY),
        library.load(),
        store.get(SHORTCUTS_KEY),
        window.LatticeShortcuts ? window.LatticeShortcuts.load() : Promise.resolve([]),
      ]);
      shortcutsCustom = Array.isArray(stored);
      shortcutsList = sanitizeShortcuts(shortcutsCustom ? stored : dynamic);
      settings = sanitize(saved);
      if (settings.source === 'library' && library.counts().total === 0) {
        settings.source = 'curated';
      }

      buildChips();
      syncControls();
      refreshLibraryUI();
      renderShortcuts();
      applyCamera();
      renderWall();
    } catch (err) {
      console.error('[lattice] boot failed', err);
      notify(t('toast.bootFailed'));
    }
  };

  boot();
})();
