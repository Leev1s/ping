# Ping acceptance criteria

These checks define observable behavior for the single-page application. Browser dimensions are CSS viewport dimensions. A normal desktop, tablet, or phone view should fit without page scrolling; short viewports and enlarged text may scroll vertically to preserve readable content. They must not clip information or introduce horizontal page scrolling.

## Product and layout

| ID | Acceptance criterion | Check |
| --- | --- | --- |
| UI-1 | The application has one English-language interface, with one “Network status” heading. No locale toggle, Chinese UI copy, slogan, or explanatory paragraph appears in the page. | Playwright audits the page language, rendered text, heading, and absence of a language control. |
| UI-2 | One page shows Cloudflare and IPinfo connection cards, all eight probe cards, two region groups with four probes each, and the session summary. | Load the page and verify two connection cards, eight probes, and the 4/4 split. |
| UI-3 | Exactly three local font families are used: Space Grotesk for brand/headings, Inter for interface text, and JetBrains Mono for measurements. The app makes no third-party font requests. | Wait for `document.fonts.ready`; inspect loaded families and font resource origins. |
| UI-4 | At 100% zoom, the page has no horizontal or vertical overflow at 320×568, 375×667, 390×844, 667×375, 768×1024, 1366×768, and 1440×900. At a very short height or enlarged text, vertical scrolling is allowed; content remains reachable and no horizontal overflow or clipping is introduced. | Playwright compares `scrollWidth`/`scrollHeight` with the viewport at the seven common sizes; inspect short-height and enlarged-text behavior separately. |
| UI-5 | Sampling changes values and plot marks without changing the dimensions or positions of the eight cards and their chart frames. Waiting, success, outliers, and failures do not expand the layout. | Compare card and plot bounding boxes before samples, after valid samples, after an outlier, after a scale change, and after an HTTP error. |
| UI-6 | Interactive controls have clear names, keyboard focus is visible, and status meaning is conveyed by text or symbols as well as color. Normal text meets at least 4.5:1 contrast; large text and non-text indicators meet the applicable WCAG contrast threshold. Common controls target 44×44 CSS pixels. | Audit control names and focus order; measure target bounds and calculate contrast ratios for real foreground/background pairs. |

## Sampling and statistics

| ID | Acceptance criterion | Check |
| --- | --- | --- |
| NET-1 | Eight distinct public endpoints are probed: Baidu, Bilibili, WeChat, and Taobao in Mainland China; Cloudflare, Google, GitHub, and Microsoft in International. | Inspect browser requests and the probe cards; confirm exactly four cards per group. |
| NET-2 | Probes start on page load and repeat continuously at the selected 3, 5, or 10-second cadence (5 seconds by default). A target never has more than one request in flight. Each request times out after 4.5 seconds. | Use fake network responses and clock control; count requests per target, in-flight requests, and timeout outcomes. |
| NET-3 | Pause stops sampling; resume restarts it. Hidden tabs and offline state stop active work. | Advance a controlled clock while paused, hidden, or offline; confirm no later probe starts and that sampling resumes when enabled. |
| NET-4 | Cloudflare uses CORS and can report HTTP success or error. The other seven use opaque responses and are labelled HTTP-unverified; timing them does not imply the status was verified. | Mock CORS success/error, opaque response, timeout, and rejected-fetch cases; inspect state labels and counts. |
| DATA-1 | Each probe shows its latest valid response time, target status, a fixed horizontal box plot with measurement points, P50, P95, jitter, attempt count, and failed-attempt count. A failed latest attempt has no fabricated latency reading. | Verify each card before and after successful, opaque, failed, and timed-out responses. |
| DATA-2 | After five valid readings, Q1, median, and Q3 define the box; Tukey 1.5 × IQR fences define the whisker endpoints. Valid observed outliers remain visible as individual points. The log(1 + ms) axis is fixed at 0–1,000 ms by default and can be switched to 0–5,000 ms. | Test known distributions and outliers; verify the five-reading threshold, whisker bounds, dots, scale toggle, and stable plot geometry. |
| DATA-3 | Only finite, non-negative successful or opaque response times enter latency statistics. HTTP errors, timeouts, and rejected fetches count as failures, not latency or packet loss. P95 uses nearest rank and appears at 40 valid samples. Jitter is the mean absolute difference between adjacent valid samples; a failed attempt breaks the pair. | Unit tests cover outcome filtering, quantiles at the 40-sample threshold, and adjacent-pair calculations across failures. |
| DATA-4 | Every statistic uses all eligible samples in the selected time window. Plot downsampling affects only the rendered points and does not affect summary statistics. | Feed more than 120 samples into a window and compare statistics with the full input set. |

## History and connection information

| ID | Acceptance criterion | Check |
| --- | --- | --- |
| HIST-1 | Each probe retains at most 1,200 attempts, including failures; across eight probes the cap is 9,600 records. Sampling and aggregate session counters continue after the cap, with the oldest record evicted per target. | Append beyond the cap and verify count, newest/oldest timestamps, and continued sampling. The browser test also runs beyond 60 attempts. |
| HIST-2 | A selected 5, 30, or 60-minute window filters statistics and plot points. Each plot draws at most 120 valid points; older dots become more transparent based on their actual age. | Verify time-window filtering, the 120-point limit, and opacity at known sample ages. |
| HIST-3 | History exists only in the current page session. Clear history resets retained samples and counters; refresh or close clears all samples. JSON export includes retained per-probe samples and counters, but no connection IP address. | Clear, refresh, and export; check bounds and search serialized JSON for both mocked connection addresses. |
| IP-1 | On page load, and on manual refresh only, Cloudflare Trace and IPinfo are each queried once. Their results remain provider-specific and can be partially available if one provider fails. | Inspect requests and mock each provider's success/failure independently. |
| IP-2 | Cloudflare information includes its observed address/family, country code, `colo`, TLS version, and WARP status when supplied. IPinfo information includes its observed address/family, location, ASN, and organization when supplied. Both addresses start masked and can be shown or hidden by the user. | Verify provider-specific fields, independent IP family handling, partial data, and the show/hide control. |
| PRIV-1 | Probe and connection requests go from the visitor's browser to the providers. Ping has no server-side IP lookup, accounts, analytics, or database; addresses are not stored in probe history or exports. | Inspect network destinations, source, in-memory samples, and exported JSON. Document that each contacted provider receives the visitor's normal connection metadata. |

## Documentation and release

| ID | Acceptance criterion | Check |
| --- | --- | --- |
| DOC-1 | Root README is English-first with a Chinese-language README link. The translated README describes the docs in Chinese without claiming the app UI supports Chinese. | Check both README files, internal links, endpoint list, privacy notes, font licenses, and current controls. |
| DOC-2 | README describes local development and Cloudflare Workers deployment with `npx wrangler login`, `npm run build`, and `npx wrangler deploy`, plus fork/domain instructions. | Follow the documented commands in a clean checkout and verify `wrangler.jsonc` matches the instructions. |
| DOC-3 | Design, acceptance, brand, IP, and history documents describe current implementation and point to primary sources. Superseded research notes and the duplicate README.en.md are removed. | Check internal links from both READMEs; confirm external citations target the cited standards or providers. |
| SIM-1 | The YAGNI cleanup removes the unused locale layer and Chinese font pipeline, the obsolete histogram helper, and the duplicate two-line Vitest config. Superseded research documents are consolidated into current design, acceptance, history, IP, and brand references. | Inspect source/config for retained code paths and verify the retired files are absent. |
| DEP-1 | CI runs type checking, unit tests, build, and Playwright tests on pushes and pull requests. The Cloudflare Worker serves `dist/` with single-page-app fallback on `ping.r3.net.eu.org`. | Inspect `.github/workflows/ci.yml`, deploy the configured Worker, and request the root and a client-side path. |

## Current verification record

Local checks pass: 22 unit tests and 5 Playwright tests (24.2 seconds), plus TypeScript and production build. The browser checks cover independent IP sources, continuous sampling beyond 60 attempts, bounded history/points, age opacity, box plots, fixed logarithmic axes, errors, privacy, three self-hosted fonts and seven common viewports. The final local run includes the statistics-result reuse and logarithmic-axis changes; CI reruns the complete checks for the release commit.

Cloudflare deployment succeeded via `npx wrangler deploy`: version `da4f7571-36e3-44e6-97aa-4d2bb53adefc` at https://ping.r3.net.eu.org/. Repository visibility and release-commit CI are separately verified during publication; the Actions result attached to the commit is authoritative.
