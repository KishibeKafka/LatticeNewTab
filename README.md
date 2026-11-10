# Lattice

A cinematic, fully customizable photo-collage **new tab** for Chrome (Manifest V3).
Inspired by the immersive album-art wall aesthetic of *folia-major*: organic layering,
subtle tilt, premium blur, and a typography-first HUD.

```
┌──────────────────────────────────────────────────────────────┐
│  LATTICE                                     32 TILES · MIXED│
│                                                              │
│                    GOOD AFTERNOON                            │
│                      15:42 ¹⁰                                │
│                MONDAY, 10 NOV · WEEK 46                      │
│              ╭──────────────────────────╮                     │
│              │ Google │ Search the web… │                     │
│              ╰──────────────────────────╯                     │
│                  / search · S shuffle · Esc                   │
│                                                              │
│  ⇄ SHUFFLE                              PHOTOS FROM LIBRARY ⚙│
└──────────────────────────────────────────────────────────────┘
```

## Status

| Stage | Scope | State |
| ----- | ----- | ----- |
| 1 | MV3 manifest, `chrome_url_overrides`, icons | ✅ |
| 2 | HUD + drawer markup, design system, clock, preview wall | ✅ |
| 3 | Collage engine: real packing, uploads, URLs, curated sets, persistence | ⏳ next |
| 4 | Motion & interaction polish | ⏳ |

The Stage 2 wall is a **deterministic preview renderer** over a demo pool — it
proves the visual system before the packing engine lands in Stage 3.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open a new tab.

No build step, no dependencies at runtime: plain HTML + CSS + ES2022.

You can also preview without installing — just open `newtab.html` in Chrome.
`chrome.storage` falls back to `localStorage` automatically in that mode.

## Project layout

```
manifest.json          MV3 manifest (new tab override, storage permissions)
newtab.html            HUD skeleton: clock, search, settings drawer
style.css              Design tokens + collage/atmosphere/HUD/drawer styles
collage.js             Wall renderer (preview layout for now)
app.js                 Clock, search, drawer, controls, persistence
icons/                 Generated PNG icons (16/32/48/128)
tools/make-icons.mjs   Zero-dependency icon generator
```

## Design system

Everything is driven by CSS custom properties, so the UI can be re-themed from
one block in `style.css`:

| Token | Purpose |
| ----- | ------- |
| `--tile-radius` | Corner radius of collage tiles |
| `--tilt-max` | Maximum random rotation |
| `--bg-blur` | Blur applied to the wall behind the HUD |
| `--dim` | Opacity of the tone wash over the wall |
| `--grain-opacity` | Film-grain texture strength |
| `--accent` | Interactive accent (lavender / indigo) |

`html[data-tone="light"]` swaps the whole HUD palette; the atmosphere layers
re-balance themselves so photos stay visible while dark type keeps contrast.

## Shortcuts

| Key | Action |
| --- | ------ |
| `/` | Focus search |
| `S` | Shuffle the wall |
| `Esc` | Close the drawer / leave search |

Search accepts plain queries (Google / Bing / DuckDuckGo) or a bare domain,
which is opened directly.

## Icons

Regenerate the PNGs after editing the mark:

```bash
node tools/make-icons.mjs
```
