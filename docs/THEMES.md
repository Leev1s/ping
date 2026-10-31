# Ping themes

The header opens a scrollable, keyboard-accessible listbox with 15 palettes:
Light, Dark, Light neutral, Dark neutral, Halloween, Forest, Dracula, Night,
Dim, Nord, Sunset, Abyss, Cupcake, Dark daisyUI 5, and Gruvbox. Each row previews
its own palette with a swatch; selecting one changes colors without moving or
resizing the page. The selector follows the style of the supplied zashboard
reference. The palette set draws on [daisyUI themes](https://daisyui.com/docs/themes/)
and adds Gruvbox.

Use semantic tokens from `src/themes.css` for page surfaces, text, status, and
plots:

| Token | Use |
| --- | --- |
| `--canvas` | Page background |
| `--surface`, `--surface-raised` | Cards, controls, and menus |
| `--ink`, `--muted` | Primary and secondary text |
| `--line` | Decorative separators |
| `--accent`, `--accent-ink`, `--accent-soft`, `--accent-line` | Selection, focus, and highlighted UI |
| `--success`, `--warning`, `--danger` | Status and failures |
| `--latency-good`, `--latency-mid`, `--latency-bad` | Probe dot from green through amber to red |
| `--grid`, `--chart-fill`, `--point` | Plot grid, box, and samples |
| `--shadow`, `--menu-backdrop`, `--neutral-soft` | Elevation and quiet surfaces |

The selected palette is stored as `data-theme` on the document root and in local
storage. Light is the default; browser controls receive each palette's native
`color-scheme`. App typography was contrast-checked in Light, Dark, and Gruvbox;
the menu's theme-specific text measured 10.75:1–16.09:1 across all 15 rows. See
[WCAG 2.2 Contrast Minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum).

## Sources

- [zashboard theme selector](https://github.com/Zephyruso/zashboard/blob/main/src/components/settings/general/ThemeSelector.vue)
- [daisyUI theme list](https://daisyui.com/docs/themes/)
- [Gruvbox palette](https://github.com/morhetz/gruvbox/blob/master/colors/gruvbox.vim)
- [Nord palette](https://github.com/nordtheme/nord/blob/develop/src/nord.css)
