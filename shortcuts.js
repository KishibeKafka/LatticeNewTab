/**
 * shortcuts.js — new-tab shortcuts.
 *
 * Uses Chrome's most-visited sites (chrome.topSites) when available and fills
 * the rest with a small built-in list, so a fresh profile still shows useful
 * shortcuts. Each entry is a plain { title, url }.
 */
(() => {
  'use strict';

  const FALLBACK = [
    { title: 'Gmail', url: 'https://mail.google.com/' },
    { title: 'YouTube', url: 'https://www.youtube.com/' },
    { title: 'GitHub', url: 'https://github.com/' },
    { title: 'Google Drive', url: 'https://drive.google.com/' },
    { title: 'Notion', url: 'https://www.notion.so/' },
    { title: 'Wikipedia', url: 'https://www.wikipedia.org/' },
    { title: 'X', url: 'https://x.com/' },
    { title: 'Reddit', url: 'https://www.reddit.com/' },
    { title: 'Stack Overflow', url: 'https://stackoverflow.com/' },
    { title: 'Bilibili', url: 'https://www.bilibili.com/' },
  ];

  const hostOf = (value) => {
    try {
      return new URL(value).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const usable = (value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const load = async () => {
    let visited = [];
    try {
      if (typeof chrome !== 'undefined' && chrome.topSites && chrome.topSites.get) {
        visited = await chrome.topSites.get();
      }
    } catch (err) {
      console.warn('[lattice] topSites unavailable', err);
    }

    const seen = new Set();
    const list = [];

    const push = (item) => {
      if (!item || !item.url || !usable(item.url)) return;
      const host = hostOf(item.url);
      if (!host || seen.has(host)) return;
      seen.add(host);
      const title = (item.title || '').trim() || host;
      list.push({ title: title.slice(0, 60), url: item.url });
    };

    for (const site of visited) push(site);
    for (const item of FALLBACK) {
      if (list.length >= 10) break;
      push(item);
    }

    return list.slice(0, 10);
  };

  window.LatticeShortcuts = { load };
})();
