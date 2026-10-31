# Typography and viewport audit

## v5 screenshot check

The live Vite build was inspected in Chromium at 100% zoom and device scale factor 1. Screenshots cover 320×568, 375×667, 667×375, and 1440×900 in Light, Dark, and Gruvbox. The theme menu was also opened at 320×568 and 1440×900. Evidence is saved under `/tmp/ping-v5-audit/`.

Every viewport rendered all eight probe cards without horizontal overflow or page scrolling. The app reached the viewport bottom exactly, including the short 320×568 phone and 667×375 landscape layouts. Repeated latency updates did not change the grid geometry. The palette menu overlays the page instead of expanding it; it scrolls internally when its 15 rows exceed the available height.

| Text role | Smallest rendered size | Largest rendered size | Notes |
| --- | ---: | ---: | --- |
| Ping wordmark | 27 px | 32 px | Proportionate to the compact and desktop headers. |
| Section headings | 12 px | 14 px | Clear hierarchy without competing with the latest readings. |
| Probe names | 11 px | 13 px | 11 px appears only at 320 px width and short landscape. |
| Latest latency | 17 px | 24 px | Remains the strongest information on each probe card. |
| P50 / P95 / jitter labels | 9 px | 10 px | Secondary labels; numeric values are 10–11 px. |
| Plot ticks | 9 px | 9 px | Three ticks keep the compact axis legible and uncluttered. |
| IP family labels | 9 px | 10 px | Values are 10 px on compact screens and 11 px on desktop. |
| Sampling interval | 10 px | 10 px | The value remains visually attached to Live. |
| Footer details | 9 px | 10 px | Tertiary session information. |
| Theme menu options | 11 px | 11 px | Each row uses its own palette and remains inside a scrollable overlay. |

No visible text was below 9 px. The compact layouts use 9 px only for supporting labels; primary readings and probe names stay larger. At 320×568 and 667×375, the page has no spare vertical space, so increasing every supporting label to 10 px requires another layout pass to preserve the one-screen fit.

The probe names, statistics, plot ticks, connection labels, and footer text were also checked against their rendered surfaces in all three themes. Their measured contrast exceeded 4.5:1. Theme-menu text contrast ranged from 10.75:1 to 16.09:1 across all 15 palettes. These measurements describe the tested colors and browser rendering; they are not a substitute for testing user-selected browser zoom or text spacing.

The IPv4 and IPv6 rows were checked with all four provider hosts stubbed to documentation-only TEST-NET addresses, including full-length 39-character IPv6 values. All probe hosts were stubbed too, so no real provider requests or client addresses were used. Full IPv6 values are visually ellipsized on the narrow screens, but the copy action preserved the complete value in the clipboard and the button title retained it. Probe names and latency readings around 4,000 ms did not overlap at 320×568, 375×667, or 667×375. A failed probe showed `No reply` without colliding with its name or other readings.

The 15-row theme menu stayed within each tested viewport and scrolled inside its own overlay; opening it did not add page scroll. The muted statistics, ticks, IP-family labels, and footer text reached a minimum measured contrast of 5.60:1 across all 15 themes. Theme-menu row text ranged from 10.75:1 upward.

The copy notice now sits below the final probe card. With the notice visible, its top remained 2 px below the last card at 320×568 and 667×375, and 3 px below at 375×667; none of these viewports gained page scrolling.

WCAG 2.2 requires text resizing, reflow, text spacing, and contrast behavior; it does not prescribe a minimum CSS font size. See [Resize Text](https://www.w3.org/TR/WCAG22/#resize-text), [Reflow](https://www.w3.org/TR/WCAG22/#reflow), and [Text Spacing](https://www.w3.org/TR/WCAG22/#text-spacing).
