# Ping

Ping is a single-page network status dashboard. It continuously measures browser HTTP response times for four services in mainland China and four international services, then presents each probe's latest reading and recent distribution.

[简体中文文档](README.zh-CN.md) · [Design decisions](docs/DESIGN.md) · [Acceptance criteria](docs/ACCEPTANCE.md)

> A reading is the time from a browser request until response headers are available. It is similar to TTFB; it is not ICMP ping, a bandwidth test, packet-loss measurement, or a general rating of network quality.

## Page and controls

- Eight probes are grouped into four Mainland China services and four International services. Each probe shows its latest reading, status, a horizontal box plot with measurement points, P50, P95, jitter, and attempt counts.
- The plot has a fixed linear 0–1,000 ms axis. It never rescales; readings over 1,000 ms remain available as exact numbers and are marked at the plot edge.
- The fixed trailing history window is 30 minutes. Each plot draws up to 120 valid measurement points, with older points shown more transparently.
- The header controls are, from left to right: live/pause status with the active interval, theme, and More options. Four themes are available: Light, Dark, Gruvbox, and Nord.
- More options contains the manual interval input and Apply button, Export data, Clear history, and GitHub. The interval accepts 1 to 300 seconds, including decimal values; the default is 3 seconds. Invalid or out-of-range values are rejected. Theme and interval preferences are saved in this browser.

## Probe endpoints

Requests go directly from the visitor's browser to these public endpoints; Ping does not proxy them.

| Region | Service | Endpoint |
| --- | --- | --- |
| Mainland China | Baidu | https://www.baidu.com/favicon.ico |
| Mainland China | Bilibili | https://www.bilibili.com/favicon.ico |
| Mainland China | WeChat | https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico |
| Mainland China | Taobao | https://www.taobao.com/favicon.ico |
| International | Cloudflare | https://speed.cloudflare.com/__down?bytes=0 |
| International | jsDelivr | https://cdn.jsdelivr.net/npm/latency-test@1.0.0/generate_200 |
| International | GitHub | https://github.com/favicon.ico |
| International | Microsoft | https://www.bing.com/favicon.ico |

Cloudflare and jsDelivr use CORS requests, so the browser can inspect HTTP status. The other six probes use opaque no-cors responses: Ping can time the response but cannot confirm its HTTP status, and marks those readings as unverified. The jsDelivr URL is a version-pinned, empty response from a third-party npm package served by jsDelivr; it is not a jsDelivr-owned test API. Its CORS response was confirmed in the current browser check, but that check was not run from mainland China and does not establish where a request is routed. See [probe endpoint research](docs/PROBE-RESEARCH.md). Endpoint availability, regional routing, and provider behavior can change.

## Sampling, statistics, and history

Sampling starts on page load and continues while the page is visible, the browser is online, and sampling is not paused. Each target runs independently with at most one in-flight request. A request times out after 4.5 seconds. The live control pauses or resumes sampling.

For each probe, statistics use valid samples from the fixed trailing 30-minute window:

- **P50** is the median.
- **P95** uses the nearest-rank definition. It is shown as soon as one valid reading exists. With fewer than 40 valid readings, a `~` prefix marks the value as an early, low-sample estimate; the prefix disappears at 40. This is a descriptive heuristic, not a population confidence interval or guarantee. P95 shows `—` only when there are no valid readings.
- **Jitter** is the mean absolute difference between adjacent valid response times. A failed attempt breaks the adjacent pair.
- **Attempts and failures** are counted separately. HTTP errors, timeouts, and rejected fetches are not valid latency samples. An opaque response can be timed, but its HTTP status remains unverified.

The box appears after five valid measurements. Its box spans Q1–Q3, the center line marks the median, and whiskers use Tukey's 1.5 × IQR rule. Individual points remain visible, including outliers; their positions are clipped to the fixed 0–1,000 ms plot range.

Ping retains at most 1,200 attempts per probe in page memory, including failures, for a maximum of 9,600 across eight probes. The cap covers about 60 minutes at the default 3-second interval, so the 30-minute view has enough retained samples. At the minimum 1-second interval, the cap covers about 20 minutes; the fixed 30-minute view then uses the available retained samples. Sampling and session counters continue after the cap, replacing the oldest record for that probe. The 120-point drawing limit does not reduce the samples used for statistics. Refreshing or closing the page clears session history. See [history and memory notes](docs/HISTORY.md).

## Connection information and privacy

On page load, and only when the connection panel's refresh control is used afterward, the browser requests:

- Cloudflare Trace at https://one.one.one.one/cdn-cgi/trace for the address and family Cloudflare observes, country code, serving data center (colo), TLS version, and WARP status.
- IPinfo at https://ipinfo.io/json for its observed address and family, city, region, country, ASN, and network organization.

The two providers are shown separately because their observed addresses and metadata can differ. Both requests are made directly from the visitor's browser and need no API key. The unauthenticated public IPinfo API is limited to 1,000 requests per day per source IP, shared by visitors using that same public IP; a request can be rate-limited. See [IPinfo's current quota details](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite) and [connection-field notes](docs/IP.md).

Ping has no server-side proxy, account system, analytics, or database. Providers receive the visitor's normal network connection metadata. Addresses are masked by default and are not added to in-memory probe history or JSON exports. Only the theme and interval preferences are stored locally; session samples are cleared when the page is refreshed or closed. Exported files contain the retained probe samples and counters, not connection addresses.

## Local development

Requirements: Node.js 22.12 or newer.

    git clone https://github.com/Leev1s/ping.git
    cd ping
    npm ci
    npm run dev

To check the project locally:

    npm run check
    npm test
    npm run build
    npx playwright install --with-deps chromium  # first browser-test run
    npm run test:e2e

GitHub Actions runs type checking, unit tests, the production build, and browser tests on pushes and pull requests.

## Deploy to Cloudflare Workers

Wrangler serves the Vite build output in dist/ as static assets with single-page-app fallback. The checked-in configuration binds ping.r3.net.eu.org as a custom domain in the Cloudflare account that manages the domain.

For the first deployment, authenticate in an interactive terminal and deploy:

    npm ci
    npx wrangler login
    npm run build
    npx wrangler deploy

The deploy command uses [wrangler.jsonc](wrangler.jsonc). For a fork, set the Worker name and custom-domain route to a domain in your Cloudflare account before deploying. To use a workers.dev address instead, remove the custom-domain route and enable workers.dev for the Worker in your Cloudflare account.

## Fonts, brand, and license

The page uses three self-hosted font families: Space Grotesk for brand and headings, Inter for interface text, and JetBrains Mono for measurements. Font files and SIL Open Font License 1.1 notices are in [public/fonts/](public/fonts/README.md). Page visits do not request fonts from a third-party font service. Ping's brand assets and visual tokens are documented in [docs/BRAND.md](docs/BRAND.md) and [docs/THEMES.md](docs/THEMES.md).

Source: [github.com/Leev1s/ping](https://github.com/Leev1s/ping). The project uses the MIT License. The adapted Magic UI Number Ticker and Magic Card components and their licenses are in [src/components/magicui/](src/components/magicui/) and [public/magicui-LICENSE](public/magicui-LICENSE). Font assets retain their respective OFL licenses.
