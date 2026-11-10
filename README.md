# Lattice

An **endless, draggable photo collage** for your new tab. No clock, no search
bar — just a wall of photos you can pan forever, and one small settings button.
Bundled photos for an instant first paint, your own uploads, image links and
curated sets, with **English / 中文** UI.

![Lattice new tab](docs/screenshot.png)

![Click a photo to bring it forward](docs/focus.png)

![Customize panel](docs/customize.png)

## Status

| Stage | Scope | State |
| ----- | ----- | ----- |
| 1 | MV3 manifest, `chrome_url_overrides`, icons | ✅ |
| 2 | Design system, drawer, photo sources | ✅ |
| 3 | Photo library, URL sources, curated sets | ✅ |
| 4 | Material polish, skeletons, reduced motion | ✅ |
| 5 | English / 中文 UI with language switch | ✅ |
| 6 | Endless wall, drag-to-pan, in-place photo focus | ✅ |

## Features

- **Endless wall** — the plane is split into cells, and every cell
  deterministically spawns an oversized, rotated photo from the pool. Pan in
  any direction and new photos keep appearing; only cells near the viewport are
  kept in the DOM, so memory stays flat.
- **Drag with inertia** — grab anywhere on the wall, flick it, and it keeps
  gliding. There are no edges to hit.
- **Click to focus** — a photo lifts out of the wall, straightens, moves to the
  centre and enlarges over a dimmed *and blurred* collage. Click it, click the
  backdrop or press `Esc` and it flies back to its spot in the wall.
- **Only one control** — the settings button in the top-right corner. The rest
  of the screen is the collage.
- **Three sources**
  - **Upload** — drop or pick images; downscaled to 1800 px, re-encoded to WebP
    and stored in IndexedDB. Nothing leaves the device.
  - **URLs** — paste any public image link; dimensions are probed and the image
    is cached by the browser.
  - **Explore** — `Classic` ships with the extension (instant + offline);
    `Editorial`, `Noir`, `Soft focus` and `Wide` stream from Lorem Picsum.
- **Bilingual** — English and 中文 with `跟随系统 / Auto / English / 中文`;
  dates, toasts and panel copy follow the choice.
- **Resilient** — local assets and seeded gradient skeletons render instantly;
  broken links keep their skeleton instead of leaving holes.

## Settings

| Group | Controls |
| ----- | -------- |
| Background | Upload · URLs · Explore |
| Wall | Density · Tilt · Gap & padding · Corner radius |
| Atmosphere | Wash · Blur · Film grain |
| Language | Auto · English · 中文 |

Clock, search, tile-shape and other no-longer-relevant options were removed.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open a new tab.

No build step and no runtime dependencies. You can also preview `newtab.html`
directly in a browser: outside the extension `chrome.storage` falls back to
`localStorage`.

## Project layout

```
manifest.json            MV3 manifest (new tab override, storage)
newtab.html              collage, settings button, drawer, focus layer
style.css                Material tokens, wall, atmosphere, drawer, focus
i18n.js                  English/中文 dictionary + DOM applier
store.js                 chrome.storage.local ⇄ localStorage adapter
library.js               IndexedDB library, upload pipeline, curated sets
collage.js               infinite virtualised wall engine
app.js                   panning, in-place focus, drawer, persistence
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
| `--dim` | Strength of the white wash over the wall |
| `--grain-opacity` | Film-grain texture |
| `--blue` / `--ink-*` | Google Material palette |

## Shortcuts

| Key | Action |
| ---- | ------ |
| `S` | Shuffle into a brand-new wall |
| `Esc` | Return the focused photo / close settings |

## Icons & default photos

```bash
node tools/make-icons.mjs      # regenerate the extension icons
node tools/fetch-defaults.mjs  # refresh the bundled photo set
```

Bundled and curated photos come from [Lorem Picsum](https://picsum.photos),
which re-hosts photography from [Unsplash](https://unsplash.com) under the
Unsplash License.
