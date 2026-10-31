# Ping

[![CI](https://github.com/Leev1s/ping/actions/workflows/ci.yml/badge.svg)](https://github.com/Leev1s/ping/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Live site](https://ping.r3.net.eu.org) · [简体中文](README.zh-CN.md)

Ping is a single-page network status dashboard. It continuously measures browser HTTP response times across four Mainland China and four international probes, with a separate shared latency scale for each group.

- See current latency, reachability, P50/P95, jitter, and a rolling distribution for each probe.
- Compare IPv4 and IPv6 exit addresses from mainland and international sources, with independent availability results.
- Sampling defaults to 3 seconds and can be adjusted. The page keeps a bounded history in memory.

Measurements run from your browser and time requests through response headers. This is not ICMP ping or a bandwidth test. Probe and IP-service requests go directly to their providers; Ping has no server relay or analytics. IP addresses are masked by default and excluded from probe history and exports. Background sampling is best effort; browsers may throttle or suspend it.

## Run locally

Requires Node.js 22.12 or newer.

```sh
git clone https://github.com/Leev1s/ping.git
cd ping
npm ci
npm run dev
```

## Deploy to Cloudflare Workers

```sh
npm ci
npx wrangler login
npm run build
npx wrangler deploy
```

For a fork, update the Worker name and custom domain in [`wrangler.jsonc`](wrangler.jsonc) to match your Cloudflare account.

## Docs

[Design](docs/DESIGN.md) · [Probe research](docs/PROBE-RESEARCH.md) · [IP data](docs/IP.md) · [History and memory](docs/HISTORY.md)

## License

Ping is MIT licensed. Fonts retain their SIL Open Font License notices; adapted Magic UI component notices are in [`public/magicui-LICENSE`](public/magicui-LICENSE).

<p align="center">
  <a href="https://www.cloudflare.com/press/press-kit/"><img src="docs/assets/cloudflare-logo.png" width="160" alt="Cloudflare"></a><br>
  Thanks to Cloudflare for hosting Ping.
</p>
