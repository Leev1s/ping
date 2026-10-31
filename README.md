# Ping

Ping is a single-page network status dashboard. It continuously measures browser HTTP response times to four services in mainland China and four international services, and shows recent measurements as fixed-scale box plots with individual points.

[简体中文文档](README.zh-CN.md) · [Design decisions](docs/DESIGN.md) · [Acceptance criteria](docs/ACCEPTANCE.md)

> A reading is the time from a browser request until response headers are available. It is similar to TTFB; it is not ICMP ping, a bandwidth test, packet-loss measurement, or a general rating of network quality.

## What the page shows

- Eight probes, grouped as four Mainland China services and four International services. Each probe has its own latest reading, latency distribution, status, and statistics.
- A horizontal box plot per probe. The box spans Q1–Q3, the line marks the median, and whiskers use Tukey's 1.5 × IQR rule. Dots show recent valid measurements; older dots become more transparent.
- A 5, 30, or 60-minute history window. Statistics use every valid sample in that window. To keep drawing work fixed, each plot displays at most 120 points.
- A fixed log(1 + ms) axis over 0–1,000 ms by default, with a 0–5,000 ms option. The scale does not expand when a new reading arrives; the numeric reading remains available for values beyond it.
- Connection details from Cloudflare and IPinfo. The providers are shown separately because their observed addresses and metadata can differ.

## Probe endpoints

Each probe uses a small public HTTP endpoint. Requests go directly from the visitor's browser to the listed provider.

| Region | Service | Endpoint |
| --- | --- | --- |
| Mainland China | Baidu | `https://www.baidu.com/favicon.ico` |
| Mainland China | Bilibili | `https://www.bilibili.com/favicon.ico` |
| Mainland China | WeChat | `https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico` |
| Mainland China | Taobao | `https://www.taobao.com/favicon.ico` |
| International | Cloudflare | `https://speed.cloudflare.com/__down?bytes=0` |
| International | Google | `https://www.gstatic.com/generate_204` |
| International | GitHub | `https://github.com/favicon.ico` |
| International | Microsoft | `https://www.bing.com/favicon.ico` |

Cloudflare permits a CORS request, so Ping can read its HTTP status. The other seven requests use opaque `no-cors` responses: Ping can time the response but cannot confirm its HTTP status. The interface marks those readings as unverified. Provider endpoint behavior and availability can change by region or over time.

Sampling starts on page load. The default interval is five seconds; the options are 3, 5, and 10 seconds. Each probe runs independently, with no more than one in-flight request per probe. A request times out after 4.5 seconds. Sampling pauses while the page is hidden or the browser is offline, and can be paused manually.

## Statistics and retained history

Statistics are calculated separately for each probe and for the selected time window:

- **P50** is the median of valid response times.
- **P95** uses the nearest-rank definition and appears after at least 40 valid samples.
- **Jitter** is the mean absolute difference between adjacent valid response times. A failed attempt breaks the adjacent pair.
- **Attempts and failures** are counted separately. HTTP errors, timeouts, and failed fetches are not valid latency samples. An opaque response can be timed, but its HTTP status remains unverified.

Ping retains at most 1,200 attempts per probe in page memory, or 9,600 attempts across all eight probes. Sampling continues after the cap: each new attempt evicts the oldest one for that probe. The selected time window filters this retained history. The point cap affects only drawing; statistics use all eligible valid samples, not the reduced set of plotted dots. Refreshing or closing the page clears the session history. See [history and memory notes](docs/HISTORY.md).

## Connection information and privacy

On page load, and only when manually refreshed afterward, the browser requests:

- Cloudflare Trace at `https://one.one.one.one/cdn-cgi/trace` for the IP address and family Cloudflare observes, country code, serving data center (`colo`), TLS version, and WARP status.
- IPinfo at `https://ipinfo.io/json` for its observed address and family, city, region, country, ASN, and network organization.

Both requests are made directly from the visitor's browser and need no API key. The unauthenticated IPinfo public API is limited to 1,000 requests per day per source IP, shared by visitors using that same public IP; a request can be rate-limited. See [IPinfo's current quota details](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite) and [connection-field notes](docs/IP.md).

Ping has no server-side proxy, account system, analytics, or database. The browser sends its network address to the probe providers and to Cloudflare/IPinfo when making those requests. Addresses are masked in the interface by default. They are not added to the in-memory probe history or to JSON exports. Exported files contain the retained probe samples and per-probe counters.

## Local development

Requirements: Node.js 22.12 or newer.

```sh
git clone https://github.com/Leev1s/ping.git
cd ping
npm ci
npm run dev
```

To check the project locally:

```sh
npm run check
npm test
npm run build
npx playwright install --with-deps chromium  # first browser-test run
npm run test:e2e
```

GitHub Actions runs type checking, unit tests, the production build, and browser tests on pushes and pull requests.

## Deploy to Cloudflare Workers

The project uses Wrangler to serve the Vite build output in `dist/` as static assets, with single-page-app fallback. The checked-in configuration binds `ping.r3.net.eu.org` as a custom domain in the Cloudflare account that manages that domain.

For the first deployment, authenticate in an interactive terminal and deploy:

```sh
npm ci
npx wrangler login
npm run build
npx wrangler deploy
```

The deploy command uses [`wrangler.jsonc`](wrangler.jsonc). For a fork, set the Worker name and custom-domain route to a domain in your Cloudflare account before running `npx wrangler deploy`. To use a `workers.dev` address instead, remove the custom-domain route and enable `workers.dev` for the Worker in your Cloudflare account.

## Fonts, brand, and license

The page uses three self-hosted font families: Space Grotesk for brand and headings, Inter for interface text, and JetBrains Mono for measurements. Font files and SIL Open Font License 1.1 notices are in [`public/fonts/`](public/fonts/README.md). Page visits do not request fonts from a third-party font service. Ping's brand assets and visual tokens are documented in [`docs/BRAND.md`](docs/BRAND.md).

Source: [github.com/Leev1s/ping](https://github.com/Leev1s/ping). The project uses the MIT License. The adapted Magic UI Number Ticker source and its license are in [`src/components/magicui/number-ticker.tsx`](src/components/magicui/number-ticker.tsx) and [`public/magicui-LICENSE`](public/magicui-LICENSE). Font assets retain their respective OFL licenses.
