# Ping themes

Ping includes four fixed palettes: **Light**, **Dark**, **Gruvbox**, and **Nord**. The small set keeps theme choice quick while covering a bright default, a neutral dark mode, a warm dark palette, and a cool dark palette. The selector changes colors only; layout and chart bounds stay fixed.

The theme approach takes inspiration from the curated [zashboard theme list](https://github.com/Zephyruso/zashboard/blob/main/src/constant/index.ts), which includes Light, Dark, Nord, and other palettes. Ping's Gruvbox and Nord colors are adaptations of the public [Gruvbox](https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim) and [Nord](https://github.com/nordtheme/nord/blob/develop/src/nord.css) palettes, tuned where needed for readable UI states. Ping does not use their logos or other brand assets.

## Tokens

All colors used for page surfaces, text, status, borders, and charts should come from `src/themes.css`:

| Token | Use |
| --- | --- |
| `--canvas` | Page background |
| `--surface`, `--surface-raised` | Cards, controls, and menus |
| `--ink`, `--muted` | Primary and secondary text |
| `--line` | Decorative separators |
| `--accent`, `--accent-ink`, `--accent-soft`, `--accent-line` | Selection, focus, and highlighted UI; use `--accent-ink` for text on solid accent fills |
| `--success`, `--warning`, `--danger` | Status and measurement states |
| `--grid`, `--chart-fill`, `--point` | Plot grid, distribution fill, and samples |
| `--shadow`, `--menu-backdrop` | Elevation and modal dimming |
| `--neutral-soft` | Quiet secondary surface |

The theme is selected with `data-theme="light"`, `"dark"`, `"gruvbox"`, or `"nord"` on the document root. Light is the default. Each palette declares its native `color-scheme` for browser controls.

## Contrast

Colors were checked with the WCAG relative-luminance contrast formula. Primary text, muted text, accent text, and success/warning/danger status colors each meet at least **4.5:1** against the canvas, card, and raised surfaces in all four palettes. The weakest checked pair is Gruvbox warning on its raised surface at about **4.59:1**. Accent outlines meet at least **3:1** against raised surfaces; ordinary separator and grid lines are decorative and are not used as the only signal for state or chart values. See [WCAG 2.2, Contrast Minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum).
