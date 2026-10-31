# Ping fonts

Ping uses exactly three self-hosted font families, licensed under the SIL Open Font License 1.1 (OFL):

| Family | Role | Weight range | Local asset | License |
| --- | --- | ---: | --- | --- |
| Inter | Latin interface text and labels | 400–700 variable | `inter-variable.woff2` | [OFL-inter.txt](OFL-inter.txt) |
| Noto Sans SC | Simplified Chinese interface text and labels | 400–700 variable | `noto-variable.woff2` | [OFL-notosanssc.txt](OFL-notosanssc.txt) |
| JetBrains Mono | Numeric measurements and compact metadata | 400–700 variable | `jetbrains-variable.woff2` | [OFL-jetbrainsmono.txt](OFL-jetbrainsmono.txt) |

The styles are requested from Google Fonts CSS and saved locally, so page visits do not fetch font resources from Google. Noto Sans SC is a text subset built from all non-ASCII characters in `zh` in `src/lib/i18n.ts`, Chinese UI literals in `src/App.tsx`, and the probe/metric terms in `scripts/update-fonts.py`. The checked-in subset requests 159 unique non-ASCII glyphs, including all current Chinese UI/probe text and the predefined network terms. The generator checks each requested code point against Google Fonts’ returned Noto unicode range before writing the subset. Inter and JetBrains Mono use only their Latin subsets.

## Refresh the assets

When adding Chinese UI copy, probe names, or measurements, regenerate the glyph subset and assets from the repository root:

```bash
python3 scripts/update-fonts.py
```

The script requires Python 3 and `curl`. It fetches variable WOFF2 assets, unicode ranges and OFL license texts from Google Fonts, verifies that every requested Chinese glyph is in the returned Noto subset, and rewrites `src/fonts.css`. Review and commit the regenerated font files together with the CSS. This refresh follows Google's current upstream font revisions; it is not a byte-for-byte pinned upstream release.

Source stylesheets:

- [Inter variable, Latin](https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap)
- Noto Sans SC variable, character subset: the script adds an encoded `&text=` query to [this family stylesheet](https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400..700&display=swap).
- [JetBrains Mono variable, Latin](https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..700&display=swap)

Font files and original license texts are distributed under each family’s OFL 1.1 license. Copyright and Reserved Font Names terms are included in the accompanying license files.
