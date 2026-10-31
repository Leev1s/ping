# Ping design and implementation decisions

## Product scope

Ping answers one practical question: how long does this browser take to receive HTTP response headers from eight service endpoints on its current network? It shows four Mainland China targets and four International targets. It does not measure bandwidth, ICMP, packet loss, or the health of an entire provider.

The information hierarchy draws on [cf.090227.xyz's network page](https://cf.090227.xyz/#/network), and the connection-information presentation draws on [ip.skk.moe](https://ip.skk.moe/). Ping keeps live measurements and connection details together on one page, with independent results for each probe.

## Information hierarchy

| Area | Information and behavior |
| --- | --- |
| Header | Ping mark and “Network status”, followed by a live/pause control that shows the cadence, a four-theme selector, and More options. There is no slogan or introductory paragraph. |
| Connection panel | IPinfo is the wider primary card (7:5 with Cloudflare on desktop); the cards are equal width on mobile. Provider-specific addresses and fields stay together, addresses start masked, and the panel has a manual refresh button after startup. |
| Probe groups | Mainland China and International, four fixed cards each. A card shows provider, endpoint host, latest reading, status, horizontal box plot and samples, P50/P95/jitter, and attempt counts. |
| Session footer | Session duration, lifetime checks, retained sample count/cap, and failed attempts. Counters continue after the raw-history cap is reached. |
| More options | Set an interval from 1 to 300 seconds (decimals allowed), export data, clear the session, or open GitHub. Connection information is refreshed from its panel button. There are no history-window or plot-scale selectors. |

The live/pause control is the only direct sampling toggle. The selected theme and interval are saved in browser local storage; samples remain in page memory only.

## Probe and measurement model

All probes run from the visitor's browser. Each target is sampled independently, with a default 3-second interval and no more than one in-flight request per target. A cache-busting query and `cache: no-store` avoid reusing a cached response. `performance.now()` measures elapsed fetch time until a response is available to the browser. A request is aborted after 4.5 seconds. Sampling pauses while the page is hidden, the browser is offline, or the user has paused it.

Cloudflare and jsDelivr use CORS, so the browser can inspect and classify their HTTP status. The other six targets use opaque `no-cors` responses: Ping can time a response but cannot inspect its status, and labels those readings “HTTP unverified.” A non-success CORS response, timeout, or rejected fetch counts as a failure. A response time attached to a non-success status is not a valid latency reading.

| Group | Public endpoint |
| --- | --- |
| Baidu | https://www.baidu.com/favicon.ico |
| Bilibili | https://www.bilibili.com/favicon.ico |
| WeChat | https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico |
| Taobao | https://www.taobao.com/favicon.ico |
| Cloudflare | https://speed.cloudflare.com/__down?bytes=0 |
| jsDelivr | https://cdn.jsdelivr.net/npm/latency-test@1.0.0/generate_200 |
| GitHub | https://github.com/favicon.ico |
| Microsoft | https://www.bing.com/favicon.ico |

These are public HTTP endpoints rather than contractual probe APIs. The pinned jsDelivr path serves a third-party npm package artifact; it is not a jsDelivr-owned test API. Its CORS-readable 200 response was confirmed in the current browser check outside Mainland China. That confirms the browser integration, not Mainland routing or node location. See the [probe endpoint research](PROBE-RESEARCH.md) for measurements, source details, and limits. Endpoint behavior, availability, and regional routing can change.

## Box plot and statistics

Every probe uses the same fixed-size horizontal Tukey box plot and linear 0–1,000 ms axis. Q1 and Q3 delimit the box, the median is its center line, and whiskers reach the most extreme observations within the 1.5 × IQR fences. Q1, median, and Q3 use linear interpolation over sorted values. The box and whiskers appear after five valid measurements. Individual sample points remain visible, including outliers. Positions are clipped at the plot boundary above 1,000 ms; the numeric readings remain available. New samples never resize the card or rescale the chart.

All statistics use valid samples from the fixed trailing 30-minute window:

- **Valid latency:** finite, non-negative elapsed time from an HTTP-successful or opaque response. Opaque results remain unverified.
- **P50:** the median.
- **P95:** nearest-rank 95th percentile. It appears from the first valid sample; a `~` prefix is shown while there are fewer than 40 readings. The marker means “early, low-sample estimate,” not a confidence interval or population-level guarantee. It shows `—` only when there are no valid readings.
- **Jitter:** mean absolute difference between adjacent valid response times. A failed attempt breaks the adjacent pair.
- **Failures:** HTTP errors, timeouts, and rejected fetches count as failed attempts, not latency samples or packet loss.

The plot draws at most 120 valid samples per probe. If more are available, it selects evenly spaced chronological points, preserving the window endpoints and observed latency extrema when the point budget permits. This is only a rendering limit: it does not change P50, P95, quartiles, whiskers, or jitter. Older points fade based on their age inside the fixed window. The axis and distribution visuals do not change size as new measurements arrive.

Cloudflare Speed Test is a useful reference for separating latency, jitter, and bandwidth measurements; Ping adopts no download/upload test or provider-specific quality score. See [Cloudflare Speed Test: About](https://speed.cloudflare.com/about), its [measurement engine](https://github.com/cloudflare/speedtest), and [NIST's box-plot definition](https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm).

## Continuous history and memory bound

Each probe retains at most 1,200 attempts in page memory, including failures; the maximum across eight probes is 9,600 records. At the default 3-second interval, the cap represents about 60 minutes, enough to fill the fixed 30-minute view. At a 1-second interval, it represents about 20 minutes, so the chart and statistics use the available portion of the fixed window. The oldest record is replaced as each probe reaches its cap; sampling and lifetime counters continue.

The rendered plot is further limited to 120 valid marks per probe. At most evenly spaced chronological points are drawn while retaining the window endpoints and observed latency extrema when the point budget permits. Mark opacity uses actual elapsed age within the 30-minute window (newest 1.0, oldest 0.16). The history does not grow with session duration.

History is session-only: it is not written to local storage or sent to a Ping server. Refresh or close clears it. Export includes retained per-probe samples and counters, not connection IP addresses. See [HISTORY.md](HISTORY.md) for the retention rationale and checks.

## Connection information and API limits

At startup and on manual refresh, Ping requests two public no-key endpoints in parallel:

- [Cloudflare Trace](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/) supplies the address and family it observes, country code, serving data center (`colo`), TLS version, and WARP status. A `colo` identifies the processing data center; anycast routing does not guarantee it is geographically nearest ([Cloudflare routing note](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/geographic-traffic-routing/)).
- [IPinfo's public JSON endpoint](https://ipinfo.io/json) supplies its observed address and family, city, region, country, ASN, and organization when available. Its unauthenticated public API is limited to 1,000 requests per day per source IP; that quota is shared by users behind the same public IP and can result in rate limiting ([current quota details](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite)).

The providers' addresses and metadata remain separate; fields from one provider are never presented as attributes of the other's address. If one request fails, the other provider's result remains useful. Requests are made from the visitor's browser, so providers receive the visitor's source IP and ordinary connection metadata. Addresses are masked by default and are not added to probe samples or exports. More details are in [IP.md](IP.md).

## Device and visual system

The ordinary desktop, tablet, portrait-phone, and landscape-phone layouts aim to show the connection panel, all eight probes, and primary controls without page scrolling. At very short viewports or enlarged text, vertical scrolling may return so content remains reachable. The page must not hide controls or clip measurements to meet a nominal one-screen target. WCAG 2.2 Reflow requires avoiding two-dimensional scrolling at a 320 CSS-pixel width; it does not require every page to fit every available height ([WCAG 2.2, SC 1.4.10](https://www.w3.org/TR/WCAG22/#reflow)).

The connection cards use a 7:5 desktop split, with equal mobile widths. Corner radii use a consistent hierarchy: 16 px for connection cards, 12 px for probe cards, and 8 px for controls. The IPinfo card is the primary visual anchor and uses the existing Magic UI MagicCard hover glow. Latest measurement values use the adapted Magic UI NumberTicker component. Motion was already in the project; this design adds no charting package, CSS framework, or additional animation dependency. Theme colors come from the four token sets in [THEMES.md](THEMES.md).

Exactly three self-hosted font families are used: Space Grotesk for brand and section headings, Inter for interface labels, and JetBrains Mono for latency and measurements. Interactive controls target at least 44 CSS pixels where layout allows. Text, control boundaries, and status indicators follow WCAG contrast guidance; status also uses labels or symbols, not color alone ([WCAG contrast minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum), [target size](https://www.w3.org/TR/WCAG22/#target-size-minimum)).

## YAGNI decisions

- The app has one English interface. Locale dictionaries, language selection, Chinese UI fonts, and glyph-subset tooling are absent. The repository keeps English and Chinese README files for readers.
- There is one box-plot statistics path; the obsolete histogram helper was removed.
- Vitest's test include rule shares the Vite config instead of using a separate two-line config.
- The product has no charting framework, state-management framework, backend, accounts, database, analytics, bandwidth test, or persistent sample store.
- The compact Magic UI components are retained for the IPinfo visual anchor and changing readings; no general-purpose design system was added.

## Research and source references

- User-provided product references: [cf.090227.xyz network page](https://cf.090227.xyz/#/network) and [ip.skk.moe](https://ip.skk.moe/).
- Box-plot method and quartile definitions: [NIST/SEMATECH e-Handbook](https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm) and [R sample quantile definitions](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html) (type 7 for quartiles). P95 uses nearest rank.
- Measurement terminology: [Cloudflare Speed Test About](https://speed.cloudflare.com/about), [Cloudflare Speed Test source](https://github.com/cloudflare/speedtest), and [Cloudflare's explanation](https://blog.cloudflare.com/how-does-cloudflares-speed-test-really-work/).
- Probe endpoint and regional-routing research: [PROBE-RESEARCH.md](PROBE-RESEARCH.md), [jsDelivr network](https://www.jsdelivr.com/network), and [Google Cloud CDN locations](https://docs.cloud.google.com/cdn/docs/locations).
- Connection fields and provider behavior: [Cloudflare /cdn-cgi/ documentation](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/), [Cloudflare routing note](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/geographic-traffic-routing/), and [IPinfo quota information](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite).
- Memory behavior: [MDN JavaScript memory management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management), [MDN Performance data](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Performance_data), and [MDN Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing); current checks are summarized in [HISTORY.md](HISTORY.md).
- Color palettes and contrast review: [THEMES.md](THEMES.md).
