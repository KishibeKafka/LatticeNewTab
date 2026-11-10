/**
 * theme.js — paints the stored theme before the first frame.
 * The preference ('auto' | 'light' | 'dark') is mirrored to localStorage by
 * app.js so the extension page can resolve it synchronously; chrome.storage
 * stays the source of truth once the app boots.
 */
(() => {
  'use strict';

  let preference = 'auto';
  try {
    const saved = localStorage.getItem('lattice:theme');
    if (saved === 'light' || saved === 'dark' || saved === 'auto') preference = saved;
  } catch {
    /* storage may be unavailable */
  }

  const systemDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const dark = preference === 'dark' || (preference === 'auto' && systemDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
