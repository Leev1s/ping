# Ping · Network status

Ping is a bilingual, single-screen network status page. It continuously measures browser HTTP requests to four public services in mainland China and four international services. Fixed-range statistics and tabular figures keep the layout steady; fonts are self-hosted.

> “Latency” is the time until a browser request's response headers become available, similar to TTFB. It is not ICMP ping and does not describe overall network quality or server health. Browser scheduling, routing, and the local network affect readings.

[简体中文](README.md) · [Acceptance criteria](docs/ACCEPTANCE.md) · [Product decisions (Chinese)](docs/DESIGN.md)

Related research, in Chinese: [device ergonomics](docs/ERGONOMICS.md) · [stable-layout principles](docs/STABLE-UI.md) · [statistics and Cloudflare Speed Test](docs/STATISTICS.md).

## Page features

- Eight probes appear in two groups: mainland China and international, four per group. Fixed-size cards show each service's latest latency, P50 over up to 60 attempts, and response status. Select a card to inspect that target's statistics.
- The selected target shows P50, P95 once at least 40 valid latency observations are available, mean adjacent-response variation, and failed attempts/total attempts. A fixed six-bin histogram uses `<50`, `50–100`, `100–250`, `250–500`, `500–1000`, and `1000+ ms` ranges and a fixed `0–100%` vertical scale. New samples update existing numbers and bins; they do not expand the chart or layout.
- Choose a 3, 5, or 10-second interval; pause and resume probing. Sampling pauses when the tab is hidden, and active requests are aborted when the browser goes offline.
- Switch between Chinese and English without reloading. Egress IP is hidden by default and can be revealed manually. Exported JSON excludes the egress IP; probe samples stay in page memory.
- The page removes slogans and explanatory paragraphs. Common screen sizes show the main interface without scrolling, with space reserved for device-specific layouts and changing figures.

Statistics are calculated per target; different services are never combined. Successful responses and timed opaque responses feed the latency distribution. HTTP errors, timeouts, and failed fetches are counted separately as “failures/attempts,” not packet loss. Even when an HTTP error has a response time, it is excluded from valid latency statistics. Opaque cross-origin timing remains marked unverified. See [statistics research](docs/STATISTICS.md) for the definitions and limits.

## Probe targets

Every round requests these free public endpoints in parallel:

| Region | Service | URL |
| --- | --- | --- |
| Mainland China | Baidu | `https://www.baidu.com/favicon.ico` |
| Mainland China | Bilibili | `https://www.bilibili.com/favicon.ico` |
| Mainland China | WeChat | `https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico` |
| Mainland China | Taobao | `https://www.taobao.com/favicon.ico` |
| International | Cloudflare | `https://speed.cloudflare.com/__down?bytes=0` |
| International | Google | `https://www.gstatic.com/generate_204` |
| International | GitHub | `https://github.com/favicon.ico` |
| International | Microsoft | `https://www.bing.com/favicon.ico` |

Only the Cloudflare probe uses CORS to read HTTP status. The other seven use opaque cross-origin probes: their request time is visible, but HTTP success cannot be confirmed. On page load, a Cloudflare `one.one.one.one/cdn-cgi/trace` request retrieves the visitor's country, IP, and edge. Visitors can refresh this information manually. Endpoint policies, cross-origin behavior, and availability vary by provider, region, and time.

## Fonts

Exactly three local, self-hosted font families are used: **Inter** (Latin interface text), **Noto Sans SC** (Simplified Chinese), and **JetBrains Mono** (latency figures). Each uses the SIL Open Font License 1.1. License files and update instructions are in [public/fonts/README.md](public/fonts/README.md). Page visits do not fetch fonts from Google Fonts.

## Local development

Node.js 22.12 or newer is required.

```bash
git clone https://github.com/Leev1s/ping.git
cd ping
npm ci
npm run dev
```

## Checks

```bash
npm run check
npm test
npm run build
npx playwright install --with-deps chromium  # install before the first browser test run
npm run test:e2e
```

GitHub Actions runs type checking, unit tests, a production build, and browser tests on each push and pull request.

## Deploy to Cloudflare Workers

Authenticate from an interactive terminal before the first deployment:

```bash
npm ci
npx wrangler login
npm run build
npx wrangler deploy
```

[`wrangler.jsonc`](wrangler.jsonc) serves static assets from `dist/`, enables single-page-app fallback, and binds the custom domain `ping.r3.net.eu.org` in the Cloudflare account that hosts `r3.net.eu.org`. Wrangler configures the domain, DNS, and certificate. Production: [ping.r3.net.eu.org](https://ping.r3.net.eu.org).

For a fork, change the Worker name and `routes` to your Cloudflare-hosted domain. To use the Wrangler-provided `workers.dev` address, remove `routes`. GitHub Actions runs CI only by default. To deploy automatically, provide a Cloudflare API Token and Account ID as GitHub Secrets and configure a deployment workflow.

## APIs and privacy

All probes run directly in the visitor's browser to the eight endpoints listed above. Connection details come from Cloudflare trace. Ping has no backend, accounts, telemetry, or database. Each target is probed every five seconds by default; probing pauses when the page is hidden. Probe providers receive ordinary connection information, while Cloudflare trace receives the visitor's IP. IP is masked by default and is excluded from probe history and exported files.

## License

This project uses the MIT License: [LICENSE](LICENSE). The adapted Magic UI Number Ticker source and its license are in [src/components/magicui/number-ticker.tsx](src/components/magicui/number-ticker.tsx) and [public/magicui-LICENSE](public/magicui-LICENSE). Font families retain their respective OFL 1.1 licenses.
