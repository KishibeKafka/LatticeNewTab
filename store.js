/**
 * store.js — tiny storage adapter.
 * Uses chrome.storage.local inside the extension and falls back to
 * localStorage when the page is opened directly (file:// or http://).
 */
(() => {
  'use strict';

  const HAS_CHROME =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  const memory = new Map();

  const store = {
    isExtension: Boolean(HAS_CHROME),

    async get(key) {
      try {
        if (HAS_CHROME) {
          const bag = await chrome.storage.local.get(key);
          return bag ? bag[key] : undefined;
        }
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : undefined;
        }
        return memory.get(key);
      } catch (err) {
        console.warn('[lattice] storage read failed', err);
        return undefined;
      }
    },

    async set(key, value) {
      try {
        if (HAS_CHROME) {
          await chrome.storage.local.set({ [key]: value });
          return;
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, JSON.stringify(value));
          return;
        }
        memory.set(key, value);
      } catch (err) {
        console.warn('[lattice] storage write failed', err);
      }
    },

    async remove(key) {
      try {
        if (HAS_CHROME) {
          await chrome.storage.local.remove(key);
          return;
        }
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        memory.delete(key);
      } catch (err) {
        console.warn('[lattice] storage remove failed', err);
      }
    },
  };

  window.LatticeStore = store;
})();
