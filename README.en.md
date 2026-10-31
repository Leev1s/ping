# Ping · Network Status

A bilingual single-page app for observing your current network. It continuously measures the time from a browser HTTP request until response headers are available to JavaScript, then shows recent trends and connection details.

> This is the time from a browser request until response headers are available (a TTFB-like measure), not the time to download the full response body and not an ICMP ping. It does not represent overall network quality or server health. Cross-origin behavior, browser scheduling, and your local network can affect readings.

[GitHub](https://github.com/Leev1s/ping) · [简体中文](README.md) · [Acceptance criteria](docs/ACCEPTANCE.md)

[Product and design decisions (Chinese)](docs/DESIGN.md) · [Reference research](docs/RESEARCH.md)

## Features

- Continuously probe five public services; review a 60-sample trend for each and current, median, P95, jitter, and failure-rate metrics for Cloudflare.
- Pause probing and choose a 3, 5, or 10-second interval. Probing pauses while the page is hidden, and the active request is aborted when the browser goes offline.
- Chinese and English interface; language and sampling interval are stored in this browser.
- IP addresses are hidden by default. A manually exported JSON contains probe results only and excludes IP addresses.
- TypeScript + React + Vite with Magic UI's Number Ticker component; no custom backend or database.

## Probe targets

Each round requests these free public endpoints in parallel. The browser can read Cloudflare's HTTP status. The other cross-origin targets use opaque requests: their request duration can be shown, but it cannot confirm that the service returned a successful response.

| Service | URL |
| --- | --- |
| Cloudflare | `https://speed.cloudflare.com/__down?bytes=0` |
| Google | `https://www.gstatic.com/generate_204` |
| GitHub | `https://github.com/favicon.ico` |
| Baidu | `https://www.baidu.com/favicon.ico` |
| Bilibili | `https://www.bilibili.com/favicon.ico` |

On page load, a separate request to `https://one.one.one.one/cdn-cgi/trace` retrieves connection details. The “Refresh connection info” control makes another request. Provider policies and endpoint availability can change or vary by network.

## Run locally

Node.js 22 or a newer LTS release is required.

```bash
git clone https://github.com/Leev1s/ping.git
cd ping
npm ci
npm run dev
```

## Check

```bash
npm run check
npm test
npm run build
# Browser acceptance (install Chromium once)
npx playwright install --with-deps chromium
npm run test:e2e
```

GitHub Actions runs these checks for every push and pull request.

## Deploy to Cloudflare Workers

You need Node.js/npm and a Cloudflare account. Authenticate in an interactive terminal before the first deployment:

```bash
npm ci
npx wrangler login
npm run build
npx wrangler deploy
```

`wrangler.jsonc` serves static assets from `dist/`, enables single-page-app routing fallback, and configures `ping.r3.net.eu.org` as a custom domain in the Cloudflare account that hosts `r3.net.eu.org`. Wrangler sets up the route, DNS, and certificate; no separate manual configuration is needed. After deployment, visit [ping.r3.net.eu.org](https://ping.r3.net.eu.org).

When deploying a fork to your own domain, first change the Worker `name` in `wrangler.jsonc` and point `routes` to a domain hosted in your Cloudflare account. To use the Wrangler-provided `workers.dev` address, remove `routes` before deploying.

For optional GitHub Actions auto-deploys, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` under **Settings → Secrets and variables → Actions**, then configure a deployment workflow. Keep the API token in GitHub Secrets. The default workflow runs CI only and does not publish automatically.

## Public APIs and privacy

Probes are direct browser requests to the public services in the table. Connection details come from Cloudflare's `one.one.one.one/cdn-cgi/trace`, which returns the public egress IP, country/region, and Cloudflare edge. These are free public endpoints; terms, availability, rate limits, and cross-origin policies are controlled by each provider and may change. Continued availability is not guaranteed.

Probing creates real network requests: the default interval is five seconds per target, and probing pauses when the page is hidden. A shorter interval increases request volume. Connection details are queried once on page load. Ping has no backend, telemetry, or remote fonts; samples stay in the current page's memory, while language and interval preferences are stored in this browser. The IP is masked by default and can be revealed by the user; it is excluded from probe history and exported JSON. Cloudflare can see the visitor's IP when receiving the connection-info request, and all probe targets see normal connection information.

## License

This project uses the MIT License; see [LICENSE](LICENSE). The adapted Magic UI Number Ticker source and its license are in [public/magicui-LICENSE](public/magicui-LICENSE).
