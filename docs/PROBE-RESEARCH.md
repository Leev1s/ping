# Probe endpoint research

**Run date:** 2026-10-31

**Recommendation:** replace the Google target with the pinned jsDelivr endpoint below, keeping the international probe count at four.

```text
https://cdn.jsdelivr.net/npm/latency-test@1.0.0/generate_200
```

The target returns an empty `200` response and was readable from the app origin with browser CORS. Use `method: "cors"`; this lets the probe verify an HTTP success, unlike the current opaque gstatic request. The npm package is version-pinned, and jsDelivr advertises a free multi-CDN service using Cloudflare, Fastly, Bunny, GCore, and additional servers. Its network page also describes locations near Chinese urban centers. That does not promise that every request will use a Mainland node.

One provenance caveat: this is a third-party npm package served by jsDelivr, not a jsDelivr-owned test API. npm lists maintainer `sukkaw` and provides no package description or repository link. Pinning `1.0.0` avoids silently following a changing package version, but the endpoint still depends on the continued availability of that package.

## Measurements

I ran Chromium against `https://ping.r3.net.eu.org/` and issued eight uncached, cache-busted cross-origin GETs per endpoint at three-second intervals. Requests omitted credentials. Latency is browser `fetch()` time until response headers, matching the app's current measurement semantics; the measurement did not wait for the body. `cdn.jsdelivr.net` was tested with CORS and gstatic with the app's `no-cors` mode.

| Endpoint | Browser result | Median | Range | Meaning |
| --- | --- | ---: | ---: | --- |
| jsDelivr `generate_200` | 8/8 CORS-readable `200`, empty body | 105.3 ms | 102.5–638.3 ms | Verified successful HTTP response |
| `www.gstatic.com/generate_204` | 8/8 opaque response | 45.0 ms | 44.1–140 ms | Timing only; status remains unverifiable |

The first jsDelivr request was the slow outlier (638 ms); the other seven were 102.5–108.1 ms. This is consistent with a cold connection followed by reused connections, so the small sample should be read as a route check, not a global performance ranking. A separate CORS-mode check against gstatic produced browser `Failed to fetch`, as expected for an endpoint without readable CORS headers. Switching that existing target to `cors` would therefore be incorrect.

I also tried `https://fastly.jsdelivr.net/npm/latency-test@1.0.0/generate_200`: it was CORS-readable in 8/8 requests with a 100.5 ms median and 98.1–669.6 ms range. The canonical `cdn.jsdelivr.net` host is preferable because jsDelivr documents it as its multi-CDN entry point and can select/fail over providers. `https://www.fastly.com/favicon.ico` was not CORS-readable in this browser, so it is not a drop-in verified probe.

## Mainland-node question and limits

Google's official Cloud CDN location list says Cloud CDN uses the same edge points of presence as Google web properties. Its Asia-Pacific list includes Hong Kong, but no Mainland China city. This is evidence against assuming that `www.gstatic.com` is served from a Mainland point of presence; it does not document the exact routing for this specific hostname or prove that no other Google edge arrangement exists. The current test environment is not in Mainland China: a request to the existing Cloudflare speed endpoint returned Cloudflare metadata `country=JP`, `city=Tokyo`, `colo=NRT`. Therefore these browser timings say nothing conclusive about Mainland reachability or latency.

jsDelivr's own network page describes a multi-CDN and custom-server network, and says it has multiple locations near Chinese urban centers. The page does not enumerate those sites in its text, so this should be described as **near-China coverage**, not as a guarantee of Mainland hosting or connectivity. Real Mainland confirmation needs probes from Mainland residential and carrier networks.

## Sources

- [jsDelivr network and China-near coverage](https://www.jsdelivr.com/network)
- [Google Cloud CDN cache locations](https://docs.cloud.google.com/cdn/docs/locations)
- [Pinned jsDelivr endpoint](https://cdn.jsdelivr.net/npm/latency-test@1.0.0/generate_200)
- [npm registry metadata for `latency-test`](https://registry.npmjs.org/latency-test)
