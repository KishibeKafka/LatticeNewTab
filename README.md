# Lattice

A **draggable, endless photo wall** for your new tab with a spotlight in the
middle. The wall is a gap-free square-cornered mosaic you can pan forever; one
photo sits enlarged in the centre, and the photos around it are re-packed to
fit. Click any photo: the wall glides so that photo reaches the centre, it
grows, and its neighbourhood reflows around it. **English / 中文.**

![Lattice new tab](docs/screenshot.png)

![Another photo selected: the view glides and the surroundings reflow](docs/selected.png)

![Customize panel](docs/customize.png)

## Status

| Stage | Scope | State |
| ----- | ----- | ----- |
| 1 | MV3 manifest, `chrome_url_overrides`, icons | ✅ |
| 2 | Design system, drawer, photo sources | ✅ |
| 3 | Photo library, URL sources, curated sets | ✅ |
| 4 | Material polish, skeletons, reduced motion | ✅ |
| 5 | English / 中文 UI with language switch | ✅ |
| 6 | Gap-free square-cornered wall | ✅ |
| 7 | Centre spotlight with local reflow | ✅ |
| 8 | Drag + click-to-centre + local reflow | ✅ |
| 9 | Complete photos (no crop) and stable swap | ✅ |
| 10 | No photo ever covers another | ✅ |

## Features

- **Endless draggable wall** — an infinite, virtualised masonry of columns with
  varying widths. Photos tile edge to edge, square corners, no gaps, no
  overlaps. Drag anywhere (with inertia) and new photos stream in.
- **Nothing is cropped and nothing is covered** — every photo, on the wall and
  around the centre, is laid out at its own aspect ratio. The magnified photo
  owns a real slot; rows and columns are re-packed around it so no photo ever
  sits on top of another.
- **Spotlight centre** — the selected photo is enlarged to the middle of the
  screen at its natural aspect ratio. The photos around it are re-packed
  gaplessly into the space above, below, left and right, forming a local
  spotlight patch that lives in the world and scrolls with it.
- **Click to select** — clicking a photo enlarges it, pans the camera so it is
  centred, and reflows its neighbourhood. The surrounding order is stable:
  only the clicked photo and the previous centre swap slots, so nearby photos
  glide and resize slightly instead of flying around. There is no "exit": the
  wall always has a selected centre.
- **Drag + select together** — after selecting, keep dragging: the spotlight
  patch travels with the wall and the plain endless mosaic is revealed beyond
  it. Click a photo out there and the spotlight re-forms around it.
- **Square corners, no gutters** — every photo meets its neighbours at right
  angles.
- **Three sources**
  - **Upload** — drop or pick images; downscaled to 1800 px, re-encoded to WebP
    and stored in IndexedDB. Nothing leaves the device.
  - **URLs** — paste any public image link; dimensions are probed and the image
    is cached by the browser.
  - **Explore** — `Classic` ships with the extension (instant + offline);
    `Editorial`, `Noir`, `Soft focus` and `Wide` stream from Lorem Picsum.
- **Bilingual** — English and 中文 with `跟随系统 / Auto / English / 中文`.

## Settings

| Group | Controls |
| ----- | -------- |
| Background | Upload · URLs · Explore |
| Atmosphere | Wash · Blur · Film grain |
| Language | Auto · English · 中文 |

## How the layout works

```
        infinite wall (gap-free masonry, draggable)
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│      ┌──────────────── spotlight patch ──────────────────┐   │
│      │          row of complete photos (top)             │   │
│      ├─────────┬────────────────────────┬────────────────┤   │
│      │ columns │      CENTRE PHOTO      │    columns     │   │
│      │ (full   │   (natural aspect)     │  (full height) │   │
│      │  height)│                        │                │   │
│      ├─────────┴────────────────────────┴────────────────┤   │
│      │         row of complete photos (bottom)           │   │
│      └───────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Photos above and below the centre sit in justified rows; photos to the left and
right sit in columns that stack to exactly the centre's height. Every rectangle
matches its image's aspect ratio, so nothing is cropped. The patch is anchored
in world coordinates, so the camera centres the selected photo and dragging
moves the patch with the wall.

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
style.css                Material tokens, wall, patch, atmosphere, drawer
i18n.js                  English/中文 dictionary + DOM applier
store.js                 chrome.storage.local ⇄ localStorage adapter
library.js               IndexedDB library, upload pipeline, curated sets
collage.js               endless wall + spotlight patch + camera
app.js                   panning, selection, drawer, sources, persistence
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
| `--bg-blur` | Blur applied to the collage |
| `--dim` | Strength of the white wash over the collage |
| `--grain-opacity` | Film-grain texture |
| `--blue` / `--ink-*` | Google Material palette |

## Shortcuts

| Key | Action |
| ---- | ------ |
| `S` | New random wall + centre |
| `Esc` | Close settings |

## Icons & default photos

```bash
node tools/make-icons.mjs      # regenerate the extension icons
node tools/fetch-defaults.mjs  # refresh the bundled photo set
```

Bundled and curated photos come from [Lorem Picsum](https://picsum.photos),
which re-hosts photography from [Unsplash](https://unsplash.com) under the
Unsplash License.
