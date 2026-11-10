# Lattice

A **Google-flavoured new tab** with a fully customizable photo-collage wall.
Bundled photos for an instant first paint, your own uploads, image links, and
curated online sets — all tunable from a Material-style side panel.

![Lattice new tab](docs/screenshot.png)

![Customize panel](docs/customize.png)

```
┌──────────────────────────────────────────────────────────────────┐
│  26 tiles · Classic                                       ⚙       │
│                                                                  │
│                    16:08                                         │
│              Monday, 10 November                                 │
│                                                                  │
│                   Lattice        ← multicolour wordmark           │
│          ╭──────────────────────────────────────────╮              │
│          │ ⌕  Search Google or type a URL   Google ⌄│              │
│          ╰──────────────────────────────────────────╯              │
│              ⬆︎ Upload   🔗 Add URL   ✦ Explore   ⇄ Shuffle        │
│                                                                  │
│  Classic set · bundled offline                  ✎ Customize      │
└──────────────────────────────────────────────────────────────────┘
```

## Status

| Stage | Scope | State |
| ----- | ----- | ----- |
| 1 | MV3 manifest, `chrome_url_overrides`, icons | ✅ |
| 2 | HUD, customize drawer, design system, clock/search | ✅ |
| 3 | Wall engine, local library, URL sources, curated sets, persistence | ✅ |
| 4 | Material polish: skeletons, focus states, reduced motion | ✅ |

## Features

- **Google-default HUD** — centred clock + date, multicolour wordmark, white
  search pill with engine switcher, shortcut tiles, and a `Customize` pill.
- **Photo wall engine** — rows are packed edge-to-edge and scaled to span the
  viewport exactly; tiles overlap by a few pixels and get a seeded rotation, so
  the wall reads as organic album art rather than a grid.
- **Three sources**
  - **Upload** — drop or pick images; they are downscaled to 1800 px, re-encoded
    to WebP and stored in IndexedDB. Nothing leaves the device.
  - **URLs** — paste any public image link; dimensions are probed and the image
    is cached by the browser.
  - **Explore** — `Classic` ships with the extension (instant + offline);
    `Editorial`, `Noir`, `Soft focus` and `Wide` stream from Lorem Picsum.
- **Live customization** — density, tilt, gap, corner radius, tile shape, wash,
  blur, film grain, 12/24-hour clock, seconds, greeting and search engine.
- **Instant & resilient** — local assets and CSS-gradient skeletons render
  immediately; images fade in when decoded; broken links fall back to their
  skeleton instead of leaving holes.
- **Persistence** — settings and library metadata live in
  `chrome.storage.local`; blobs live in IndexedDB (`unlimitedStorage`).

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open a new tab.

No build step and no runtime dependencies.

You can also preview `newtab.html` directly in a browser. Outside the extension
`chrome.storage` falls back to `localStorage`, and the same UI works.

## Project layout

```
manifest.json            MV3 manifest (new tab override, storage)
newtab.html              HUD + customize drawer markup
style.css                Material tokens, wall, atmosphere, drawer
store.js                 chrome.storage.local ⇄ localStorage adapter
library.js               IndexedDB library, upload pipeline, curated sets
collage.js               full-bleed row-packing wall engine
app.js                   clock, search, drawer, controls, persistence
assets/defaults/         24 bundled photos (instant, offline)
icons/                   generated PNG icons (16/32/48/128)
tools/make-icons.mjs     zero-dependency icon generator
tools/fetch-defaults.mjs refreshes assets/defaults from Lorem Picsum
```

## Storage model

| Data | Where | Notes |
| ---- | ----- | ----- |
| Settings | `chrome.storage.local` → `lattice:settings` | clamped + validated on load |
| Library metadata | `chrome.storage.local` → `lattice:library` | id, kind, dimensions, name |
| Local photo blobs | IndexedDB `lattice-photos/photos` | WebP, max 1800 px, quality 0.82 |
| Local thumbnails | IndexedDB (same record) | 320 px WebP for the drawer |

Uploads are never sent anywhere. Network sets and pasted URLs are fetched by
the browser straight from their host.

## Design tokens

| Token | Purpose |
| ----- | ------- |
| `--tile-radius` | Collage tile corner radius |
| `--bg-blur` | Blur applied to the wall |
| `--dim` | Strength of the white wash that keeps the HUD legible |
| `--grain-opacity` | Film-grain texture |
| `--blue` / `--ink-*` | Google Material palette |

## Shortcuts

| Key | Action |
| ---- | ------ |
| `/` | Focus search |
| `S` | Shuffle the wall |
| `Esc` | Close the drawer / leave search |

Search accepts a query (Google / Bing / DuckDuckGo) or a URL, which is opened
directly.

## Icons & default photos

```bash
node tools/make-icons.mjs      # regenerate the extension icons
node tools/fetch-defaults.mjs  # refresh the bundled photo set
```

Bundled and curated photos come from [Lorem Picsum](https://picsum.photos),
which re-hosts photography from [Unsplash](https://unsplash.com) under the
Unsplash License.
