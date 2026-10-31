# Ping design and implementation decisions

## Product scope

Ping answers one practical question: how long does this browser take to receive HTTP response headers from eight service endpoints on its current network? It shows four Mainland China targets and four International targets. It does not measure bandwidth, ICMP, packet loss, or the health of an entire provider.

The information hierarchy draws on [cf.090227.xyz's network page](https://cf.090227.xyz/#/network), and the connection-information presentation draws on [ip.skk.moe](https://ip.skk.moe/). Ping keeps live measurements and connection details together on one page, with independent results for each probe.

## Information hierarchy

| Area | Information and behavior |
| --- | --- |
| Header | Ping mark and “Network status”, followed by two matching icon buttons: a 15-theme listbox and More options. Theme changes use a short Magic UI-inspired circle reveal, with reduced-motion and unsupported-browser fallbacks. There is no slogan or introductory paragraph. |
| Connection panel | Equal Mainland and International cards show IPv4 and IPv6 from Tencent DNSPod and Cloudflare's ICanHazIP endpoint. Addresses start visible, can be hidden or copied, and refresh manually. Location and network describe the observed IPv4 address (or IPv6 when IPv4 is unavailable). |
| Probe groups | Mainland China and International, four fixed cards each. A card shows service, endpoint host, latest reading or failure state, a latency-colored activity dot, horizontal box plot and samples, P50/P95/jitter, and attempt counts. |
| Session footer | A plain bottom status row shows session duration, cumulative measurements and failures on the left, plus animated Live/pause and cadence on the right. It has no horizontal border or divider beside Live. Internal history capacity is not displayed. Sampling continues after the memory cap is reached. |
| More options | Set an interval from 1 to 300 seconds (decimals allowed), export data, clear the session, or open GitHub. Connection information is refreshed from its panel button. There are no history-window or plot-scale selectors. |

The live/pause control is the only direct sampling toggle. The selected theme and interval are saved in browser local storage; samples remain in page memory only.

## Probe and measurement model

All probes run from the visitor's browser. Each target discards its first completed request as warm-up once per session; pause/resume, visibility changes and interval changes do not repeat warm-up. Clear history starts a new warm-up. Each target is sampled independently, with a default 3-second interval and no more than one in-flight request per target. A cache-busting query and `cache: no-store` avoid reusing a cached response. `performance.now()` measures elapsed fetch time until a response is available to the browser. A request is aborted after 4.5 seconds. User pause and offline state stop sampling. Hidden-tab sampling is best effort: browsers may throttle or suspend timers. When the page becomes visible, a fresh round starts immediately; Ping does not replay missed intervals.

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

Every probe uses a fixed-size horizontal Tukey box plot. Each region's four probes share a linear range: the right bound is a lower bound at the lowest valid sample rounded down to 50 ms and an upper bound at the largest per-probe P95 rounded up to 50 ms. At least one 50 ms interval is shown; empty groups default to 0–50 ms. Tick marks use 50 ms increments, with sparse labels to prevent overlap. Q1 and Q3 delimit the box, the median is its center line, and whiskers reach the most extreme observations within the 1.5 × IQR fences. Quartiles use linear interpolation over sorted values. The box and whiskers appear after five valid measurements. Individual sample points remain visible, including outliers. Points beyond the current range stay clipped to the boundary and are indicated separately; the card and plot frame keep fixed dimensions as the shared range changes.

All statistics use valid samples from the fixed trailing 30-minute window:

- **Valid latency:** finite, non-negative elapsed time from an HTTP-successful or opaque response. Opaque results remain unverified.
- **P50:** the median.
- **P95:** nearest-rank 95th percentile. It appears from the first valid sample; a `~` prefix is shown while there are fewer than 40 readings. The marker means “early, low-sample estimate,” not a confidence interval or population-level guarantee. It shows `—` only when there are no valid readings.
- **Jitter:** mean absolute difference between adjacent valid response times. A failed attempt breaks the adjacent pair.
- **Failures:** HTTP errors, timeouts, and rejected fetches count as failed attempts, not latency samples or packet loss.

The plot draws at most 120 valid samples per probe. If more are available, it retains a recent tail and the window endpoints/extrema, then selects older marks by fixed per-sample priority. Stable keys preserve the retained point nodes and jitter lanes instead of redrawing a different evenly spaced sample every round. A new valid point gets one 900 ms expansion ring, clipped to its plot; reduced-motion preferences disable the animation. This is only a rendering limit: it does not change P50, P95, quartiles, whiskers, or jitter. Older points fade based on their actual age inside the fixed window. Probe dots change from green at low latency through amber to red at 500 ms and flash during a request. A failed latest attempt shows Timeout, HTTP error, or No reply without fabricating a reading; retained history remains visible but dimmed.

Cloudflare Speed Test is a useful reference for separating latency, jitter, and bandwidth measurements; Ping adopts no download/upload test or provider-specific quality score. See [Cloudflare Speed Test: About](https://speed.cloudflare.com/about), its [measurement engine](https://github.com/cloudflare/speedtest), and [NIST's box-plot definition](https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm).

## Continuous history and memory bound

Each probe retains at most 1,200 attempts in page memory, including failures; the maximum across eight probes is 9,600 records. At the default 3-second interval, the cap represents about 60 minutes, enough to fill the fixed 30-minute view. At a 1-second interval, it represents about 20 minutes, so the chart and statistics use the available portion of the fixed window. The oldest record is replaced as each probe reaches its cap; sampling and lifetime counters continue.

The rendered plot is further limited to 120 valid marks per probe. Recent points, window endpoints and extrema are retained, with stable-priority selection of older marks. Mark opacity uses elapsed age within the 30-minute window (newest 1.0, oldest 0.16), with a five-second visual refresh tick; each new measurement renders immediately. Per-probe summaries are reused until new data arrives or an exact window boundary changes eligibility. The history does not grow with session duration.

History is session-only: it is not written to local storage or sent to a Ping server. Refresh or close clears it. Export includes retained per-probe samples and counters, not connection IP addresses. See [HISTORY.md](HISTORY.md) for the retention rationale and checks.

## Connection information and API limits

At startup and on manual refresh, Ping makes four direct no-key lookups: Tencent DNSPod's IPv4 and IPv6 check endpoints, and Cloudflare's ICanHazIP IPv4 and IPv6 endpoints. Each returns a plain-text address; cards keep the two route results separate. Addresses start visible and can be hidden or copied. IPinfo enriches one observed address per source (IPv4 preferred) with location and network; lookup errors never block address display or measurements. Explicit HTTP 501 means unsupported; other HTTP and browser network errors are unavailable because fetch cannot distinguish missing family support from DNS or CORS failures. The requests expose the visitor's source address to each provider and are not proxied or stored by Ping. The sources and observed Mainland route are documented in [IP.md](IP.md).

## Device and visual system

The ordinary desktop, tablet, portrait-phone, and landscape-phone layouts aim to show the connection panel, all eight probes, and primary controls without page scrolling. At very short viewports or enlarged text, vertical scrolling may return so content remains reachable. The page must not hide controls or clip measurements to meet a nominal one-screen target. WCAG 2.2 Reflow requires avoiding two-dimensional scrolling at a 320 CSS-pixel width; it does not require every page to fit every available height ([WCAG 2.2, SC 1.4.10](https://www.w3.org/TR/WCAG22/#reflow)).

The connection cards use equal columns. Corner radii use a consistent hierarchy: 16 px for connection cards, 12 px for probe cards, and 8 px for controls. The DNSPod card is the primary visual anchor and uses the existing Magic UI MagicCard hover glow. Latest readings update directly to the measured integer, avoiding continuous spring-driven DOM text writes. The point-arrival ring and send/receive activity remain animated. Motion was already in the project; this design adds no charting package, CSS framework, or additional animation dependency. Theme colors come from the 15 token sets in [THEMES.md](THEMES.md).

Exactly three self-hosted font families are used: Space Grotesk for brand and section headings, Inter for interface labels, and JetBrains Mono for latency and measurements. Interactive controls target at least 44 CSS pixels where layout allows. Text, control boundaries, and status indicators follow WCAG contrast guidance; status also uses labels or symbols, not color alone ([WCAG contrast minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum), [target size](https://www.w3.org/TR/WCAG22/#target-size-minimum)).

## YAGNI decisions

- The app has one English interface. Locale dictionaries, language selection, Chinese UI fonts, and glyph-subset tooling are absent. The repository keeps English and Chinese README files for readers.
- There is one box-plot statistics path; the obsolete histogram helper was removed.
- Vitest's test include rule shares the Vite config instead of using a separate two-line config.
- The product has no charting framework, state-management framework, backend, accounts, database, analytics, bandwidth test, or persistent sample store.
- The compact Magic UI components are retained for the DNSPod visual anchor and changing readings; no general-purpose design system was added.

## Research and source references

- User-provided product references: [cf.090227.xyz network page](https://cf.090227.xyz/#/network) and [ip.skk.moe](https://ip.skk.moe/).
- Box-plot method and quartile definitions: [NIST/SEMATECH e-Handbook](https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm) and [R sample quantile definitions](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html) (type 7 for quartiles). P95 uses nearest rank.
- Measurement terminology: [Cloudflare Speed Test About](https://speed.cloudflare.com/about), [Cloudflare Speed Test source](https://github.com/cloudflare/speedtest), and [Cloudflare's explanation](https://blog.cloudflare.com/how-does-cloudflares-speed-test-really-work/).
- Probe endpoint and regional-routing research: [PROBE-RESEARCH.md](PROBE-RESEARCH.md), [jsDelivr network](https://www.jsdelivr.com/network), and [Google Cloud CDN locations](https://docs.cloud.google.com/cdn/docs/locations).
- Connection endpoints, CORS checks, DNSPod routing evidence, and provider limits: [IP.md](IP.md), [DNSPod/Tencent terms](https://docs.dnspod.com/account/terms-of-service/), and the [ICanHazIP owner announcement](https://major.io/p/a-new-future-for-icanhazip/).
- Memory behavior: [MDN JavaScript memory management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management), [MDN Performance data](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Performance_data), and [MDN Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing); current checks are summarized in [HISTORY.md](HISTORY.md).
- Color palettes and contrast review: [THEMES.md](THEMES.md).

Runtime profiling and before/after measurements are documented in [PERFORMANCE.md](PERFORMANCE.md).
