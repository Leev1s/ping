# Ping brand system

## Idea

Ping observes the time between sending a browser request and receiving its response. Its mark draws a probe from one endpoint, through a service node, and back to the starting point. The return path signifies a measured response rather than a generic heartbeat. It works as a single color and does not rely on animation.

## Assets

- [`mark.svg`](../public/brand/mark.svg): 32 × 32 site mark on a transparent background.
- [`wordmark.svg`](../public/brand/wordmark.svg): horizontal mark plus “ping.” wordmark; intended height 40 px. Lettering is outlined, so it renders consistently without loading a font.
- [`avatar.svg`](../public/brand/avatar.svg): 512 × 512 rounded square app/repository avatar. The central mark has generous clear space to survive a circular crop.
- [`favicon.svg`](../public/favicon.svg): 64 × 64 browser icon using the same blue field and white mark.

## Product tokens

| Token | Value | Use |
| --- | --- | --- |
| Ping blue | `#2555BB` | Mark, link and selected-state accent. |
| Ink | `#192638` | Product name and primary text. |
| Canvas | `#F3F5F8` | Page background. |
| Paper | `#FFFFFF` | Probe cards and summary surfaces. |
| Secondary text | `#53637A` | Supporting information. |
| Line | `#DCE2EB` | Card and control edges. |
| Brand and heading type | Space Grotesk, 600–700 | Wordmark source, product name and section headings. |
| Interface type | Inter, 400–600 | English labels and supporting copy. |
| Measurement type | JetBrains Mono, 400–600 | Latency, units, percentiles and counts. |
| Mark grid | 32 × 32 | Primary mark construction grid; nominal stroke 2.5 units, round caps and joins. |
| Corners | 8 / 12 / 14 px | Controls / probe cards / summary cards. |

Keep the mark stroke, arrow direction, endpoint order and clear space intact when scaling. Use the avatar over photographic or user-selected backgrounds; use the transparent mark or wordmark on the light product canvas. Maintain 44 px minimum interaction targets around a clickable mark. A decorative inline copy should use `aria-hidden="true"`; a standalone asset includes a title and description for accessible naming. The SVGs stay vector at any size; use `image-rendering: auto` and do not apply a raster filter to the mark.

## Research

The system keeps icon construction to one grid and a small set of sizes. This follows Carbon Design System guidance that product icons should share consistent sizing and alignment; Carbon uses 16 px artboards by default with 20/24/32 px variants. See [Carbon icon sizing](https://www.carbondesignsystem.com/building-blocks/foundations/icons/guidelines) and [W3C SVG accessible names](https://www.w3.org/TR/SVG/struct/).
