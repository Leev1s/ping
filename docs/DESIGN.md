# Ping design and implementation decisions

## Product scope

Ping answers one practical question: how long does this browser take to receive HTTP response headers from these eight service endpoints on the current network? The page shows four Mainland China targets and four International targets. It does not attempt to measure bandwidth, ICMP, packet loss, or the health of an entire provider.

The product takes the information hierarchy of [cf.090227.xyz's network page](https://cf.090227.xyz/#/network) and the connection-information presentation of [ip.skk.moe](https://ip.skk.moe/) as references. Ping keeps connection details and ongoing measurements together on one screen, with independent results for each target.

## Information hierarchy

| Area | Information and behavior |
| --- | --- |
| Header | Ping wordmark, “Network status”, current sampling state, history-window selector, pause/resume, and a compact options menu. There is no slogan or introductory paragraph. |
| Connection panel | Separate Cloudflare and IPinfo result cards. Each card keeps its observed address attached to its own provider-specific fields. Addresses start masked; refresh is manual after the initial page load. |
| Probe groups | Mainland China and International, four fixed cards each. Every card shows provider, endpoint hostname, latest reading, verification/failure state, a box plot with sample points, P50/P95/jitter, and attempt counts. |
| Session footer | Session duration, total checks, retained sample count/cap, and failed attempts. These counters continue to increase while sampling runs even after the raw-history cap is reached. |
| Options | Set the 3/5/10-second sampling interval; switch the fixed chart scale between 0–1,000 and 0–5,000 ms; export or clear session history; refresh connection information. |

## Probe and measurement model

All eight probes are initiated by the visitor's browser. Each target is sampled independently, with a default interval of five seconds and no overlapping requests for that target. A URL cache key and `cache: no-store` avoid reusing a cached response; `performance.now()` measures elapsed request time. A request is aborted after 4.5 seconds. Sampling stops when the page is hidden, the browser goes offline, or the user pauses it.

The Cloudflare endpoint permits CORS, so the browser can read and classify its HTTP status. The other seven endpoints use opaque `no-cors` responses: the browser can time a response but cannot inspect its status. The UI labels these measurements “HTTP unverified.” A non-success HTTP response, timeout, or rejected fetch counts as a failed attempt. A response time attached to a non-success HTTP status is not treated as valid latency.

| Group | Public endpoint |
| --- | --- |
| Baidu | `https://www.baidu.com/favicon.ico` |
| Bilibili | `https://www.bilibili.com/favicon.ico` |
| WeChat | `https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico` |
| Taobao | `https://www.taobao.com/favicon.ico` |
| Cloudflare | `https://speed.cloudflare.com/__down?bytes=0` |
| Google | `https://www.gstatic.com/generate_204` |
| GitHub | `https://github.com/favicon.ico` |
| Microsoft | `https://www.bing.com/favicon.ico` |

These are public HTTP endpoints, not contractual probe APIs. Their availability, CORS policy, response, and regional routing are controlled by their providers and can change.

## Box plot and statistics

Each probe has one fixed-size horizontal Tukey box plot. Q1 and Q3 delimit the box, the median is its center line, and whiskers reach the most extreme observed values within the 1.5 × IQR fences. Q1, median, and Q3 use linear interpolation over the sorted values. The box and whiskers appear after five valid measurements; individual readings are shown as sample dots. Outliers remain visible as dots without stretching the box. A fixed `log(1 + latencyMs)` position transform is shared by every probe; zero is valid, and both small delays and the long tail remain readable. See [symlog scales](https://d3js.org/d3-scale/symlog) for this zero-safe transformation; Ping uses `Math.log1p` directly, without adding D3. All quartiles and Tukey fences are computed on raw milliseconds before projection. The user can choose 0–1,000 or 0–5,000 ms. Values outside that scale remain visible in the card's numeric reading and at the plot boundary. New samples never rescale the chart or change card geometry.

- **Valid latency:** finite, non-negative response time from an HTTP-successful or opaque response. Opaque results remain explicitly unverified.
- **P50:** median of all valid latency samples in the selected time window.
- **P95:** nearest-rank 95th percentile; shown after 40 valid samples. This short-window statistic is descriptive, not an SLA or service score.
- **Jitter:** mean absolute difference between adjacent valid response times. A failure breaks the adjacent pair.
- **Failures:** HTTP errors, timeouts, and rejected fetches are counted as failed attempts, separate from latency. They are not packet loss.

Statistics use every eligible sample in the selected window. The plot's point limit is only a rendering limit: downsampling does not change P50, P95, whiskers, or jitter. Cloudflare Speed Test is a useful reference for separating latency, jitter, and bandwidth measurements; Ping adopts no download/upload test or provider-specific quality score. See [Cloudflare Speed Test: About](https://speed.cloudflare.com/about), the [measurement engine](https://github.com/cloudflare/speedtest), and [NIST's box-plot definition](https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm).

## Continuous history and fixed visual bounds

The history selector offers 5, 30, and 60 minutes. Each probe retains its latest 1,200 attempts in page memory, including failures. At the default five-second interval this is about 100 minutes per probe; the cap represents about 60 minutes at three seconds or 200 minutes at ten seconds. Across eight probes, no more than 9,600 sample records are retained. Sampling and aggregate session counters continue after the cap; each new sample replaces that probe's oldest retained sample.

Each plot draws at most 120 valid samples in the chosen time window. If the window contains more, points are selected across the time range while preserving endpoints and observed latency extrema when the point budget permits. Point opacity is based on elapsed age in the selected window: the oldest marks are most transparent and the newest are fully opaque. The chart frame, axes, labels, and card dimensions remain fixed as samples arrive.

Raw history is session-only. It is not stored in local storage or sent to a Ping server; refresh or close clears it. JSON export contains the retained per-probe samples and counters, not either connection IP address. The full retention rationale and checks are in [HISTORY.md](HISTORY.md).

## Connection information and API limits

At startup, and again only after a manual refresh, Ping requests two public no-key endpoints in parallel:

- [Cloudflare Trace](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/) supplies the address and family it observes, country code, serving data center (`colo`), TLS version, and WARP status. A `colo` code identifies the processing data center; anycast routing does not guarantee that it is the geographically nearest one ([Cloudflare routing note](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/geographic-traffic-routing/)).
- [IPinfo's public JSON endpoint](https://ipinfo.io/json) supplies its observed address and family, city, region, country, ASN, and organization when available. Its unauthenticated public API is limited to 1,000 requests per day per source IP; that quota is shared by users behind the same public IP and can result in rate limiting ([current IPinfo quota details](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite)).

The two providers' addresses and metadata remain separate; one provider's fields are never presented as attributes of the other's address. If a provider fails, the other provider's data remains useful. Requests are made from the visitor's browser, so those providers receive ordinary connection metadata and the visitor's source IP. The interface masks both addresses by default. Addresses are not added to probe samples or exports. More details are in [IP.md](IP.md).

## Device and visual system

The ordinary desktop, tablet, portrait-phone, and landscape-phone layouts are designed to expose the connection panel, all eight probes, and primary controls without page scrolling. The application has a minimum content height for readability; at very short viewports or enlarged text, vertical scrolling may return so content remains accessible. The layout must not hide controls or clip the measurements to preserve a nominal “one-screen” target. WCAG 2.2 Reflow requires avoiding two-dimensional scrolling at a 320 CSS-pixel width; it does not require every page to fit every available height ([WCAG 2.2, SC 1.4.10](https://www.w3.org/TR/WCAG22/#reflow)).

The self-hosted type system contains exactly three families: Space Grotesk for brand/section headings, Inter for interface labels, and JetBrains Mono for latency and measurement figures. Color and mark tokens, local brand assets, and type roles are listed in [BRAND.md](BRAND.md). Interactive controls target at least 44 CSS pixels where layout allows. Text, control boundaries, and status indicators should be evaluated against WCAG contrast guidance; status uses labels or symbols as well as color ([WCAG contrast minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum), [target size](https://www.w3.org/TR/WCAG22/#target-size-minimum)).

## YAGNI decisions

- The app has one English interface. Locale dictionaries, language selection, Chinese font assets, and a glyph-subset generator were removed; the repository keeps an English and a Chinese-language README for readers.
- The old fixed histogram helper and its separate tests were removed when the app moved to one box-statistics helper. Statistics are not duplicated in a second visualization path.
- Vitest's test include rule now shares the Vite config rather than living in a second two-line config file.
- The former research notes were consolidated into this decision record, [ACCEPTANCE.md](ACCEPTANCE.md), and the focused [HISTORY.md](HISTORY.md), [IP.md](IP.md), and [BRAND.md](BRAND.md) references. The retained docs describe shipped behavior and checks rather than a parallel speculative architecture.
- Ping has no charting framework, state-management framework, backend, accounts, database, analytics, bandwidth test, or persistent sample store. The copied [Magic UI Number Ticker](../src/components/magicui/number-ticker.tsx) remains a small requested component.

## Research and source references

- User-provided product references: [cf.090227.xyz network page](https://cf.090227.xyz/#/network) and [ip.skk.moe](https://ip.skk.moe/).
- Measurement terminology and metric separation: [Cloudflare Speed Test About](https://speed.cloudflare.com/about), [Cloudflare Speed Test source](https://github.com/cloudflare/speedtest), and [Cloudflare's explanation of its speed test](https://blog.cloudflare.com/how-does-cloudflares-speed-test-really-work/).
- Tukey box plots and the 1.5 × IQR fences: [NIST/SEMATECH e-Handbook](https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm).
- Responsive reflow, text contrast, and target sizing: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- Public IP fields and provider behavior: [Cloudflare `/cdn-cgi/` documentation](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/), [Cloudflare `colo` routing note](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/geographic-traffic-routing/), and [IPinfo's API quota information](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite).
- Fixed retained sample bounds and browser memory behavior: [MDN JavaScript memory management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management) and [MDN Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing); implementation checks are summarized in [HISTORY.md](HISTORY.md).

Box-plot method references: [NIST box plots with fences](https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm) and [R sample quantile definitions](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html) (type 7 for Q1/Q2/Q3). P95 uses the separately documented nearest-rank rule.
