# Ping fonts

Ping uses exactly three self-hosted font families. The interface is English-only, and all font requests resolve to local assets.

| Family | Role | Weight range | Asset | License |
| --- | --- | ---: | --- | --- |
| Space Grotesk | Brand wordmark source and section headings | 400–700 variable | `space-grotesk-variable.woff2` | [OFL-spacegrotesk.txt](OFL-spacegrotesk.txt) |
| Inter | Interface labels and supporting copy | 400–700 variable | `inter-variable.woff2` | [OFL-inter.txt](OFL-inter.txt) |
| JetBrains Mono | Latency values and measurement metadata | 400–700 variable | `jetbrains-variable.woff2` | [OFL-jetbrainsmono.txt](OFL-jetbrainsmono.txt) |

The wordmark SVG uses outlined Space Grotesk lettering, so its appearance does not depend on font loading. The original typeface remains available for product headings.

## Sources

- [Space Grotesk Latin variable font stylesheet](https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400..700&display=swap)
- [Inter Latin variable font stylesheet](https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap)
- [JetBrains Mono Latin variable font stylesheet](https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..700&display=swap)

The bundled WOFF2 files and accompanying license texts are distributed under the SIL Open Font License 1.1. Preserve the license files if an upstream font asset is updated.
