# Lattice

An **endless photo wall** for your new tab. Photos never cover each other: they
are laid out in a random masonry of natural-aspect images you can pan forever.
Click one and the whole wall glides and zooms until that photo sits enlarged in
the centre. One small settings button, no clock, no search bar, **English / 中文**.

![Lattice new tab](docs/screenshot.png)

![Click a photo: the wall glides and zooms](docs/focus.png)

![Customize panel](docs/customize.png)

## Status

| Stage | Scope | State |
| ----- | ----- | ----- |
| 1 | MV3 manifest, `chrome_url_overrides`, icons | ✅ |
| 2 | Design system, drawer, photo sources | ✅ |
| 3 | Photo library, URL sources, curated sets | ✅ |
| 4 | Material polish, skeletons, reduced motion | ✅ |
| 5 | English / 中文 UI with language switch | ✅ |
| 6 | Endless wall, drag-to-pan | ✅ |
| 7 | Non-overlapping masonry, camera-based focus | ✅ |

## Features

- **No overlaps** — every photo is placed in a column at its own natural aspect
  ratio, sized to fit, and separated by gaps. Layout is checked to be
  collision-free; nothing is ever cropped or covered.
- **Random masonry** — column widths, horizontal insets, vertical phases and
  gaps are all seeded per column, so no rows or seams line up and the rhythm
  keeps changing as you pan.
- **Endless in both axes** — a column repeats with its own period, so dragging
  generates new photos forever. Only columns near the viewport stay in the DOM.
- **Camera focus** — clicking a photo animates the camera (`translate` +
  `scale`) so the clicked image is centred and enlarged (~1.2–3×) while the rest
  of the wall glides with it. Click anywhere or press `Esc` to return to the
  exact previous view.
- **Drag with inertia** — grab anywhere on the wall and flick it; there are no
  edges to hit.
- **Three sources**
  - **Upload** — drop or pick images; downscaled to 1800 px, re-encoded to WebP
    and stored in IndexedDB. Nothing leaves the device.
  - **URLs** — paste any public image link; dimensions are probed and the image
    is cached by the browser.
  - **Explore** — `Classic` ships with the extension (instant + offline);
    `Editorial`, `Noir`, `Soft focus` and `Wide` stream from Lorem Picsum.
- **Bilingual** — English and 中文 with `跟随系统 / Auto / English / 中文`;
  all panel copy, toasts and labels follow the choice.

## Settings

| Group | Controls |
| ----- | -------- |
| Background | Upload · URLs · Explore |
| Atmosphere | Wash · Blur · Film grain |
| Language | Auto · English · 中文 |

Layout controls (density, tilt, gap, radius, tile shape) were removed: the wall
sizes and spaces itself so photos stay whole.

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
newtab.html              collage, settings button, drawer
style.css                Material tokens, wall, atmosphere, drawer
i18n.js                  English/中文 dictionary + DOM applier
store.js                 chrome.storage.local ⇄ localStorage adapter
library.js               IndexedDB library, upload pipeline, curated sets
collage.js               endless non-overlapping masonry + camera
app.js                   panning, camera focus, drawer, persistence
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
| `--tile-radius` | Photo corner radius |
| `--bg-blur` | Blur applied to the wall |
| `--dim` | Strength of the white wash over the wall |
| `--grain-opacity` | Film-grain texture |
| `--blue` / `--ink-*` | Google Material palette |

## Shortcuts

| Key | Action |
| ---- | ------ |
| `S` | Shuffle into a brand-new wall |
| `Esc` | Return the camera / close settings |

## Icons & default photos

```bash
node tools/make-icons.mjs      # regenerate the extension icons
node tools/fetch-defaults.mjs  # refresh the bundled photo set
```

Bundled and curated photos come from [Lorem Picsum](https://picsum.photos),
which re-hosts photography from [Unsplash](https://unsplash.com) under the
Unsplash License.
