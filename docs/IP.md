# IP information

Ping reads connection details directly from two public providers when the page
loads or the user refreshes the connection panel:

- Cloudflare Trace provides the address and family observed by Cloudflare, plus
  the serving data center (`colo`), country code, TLS version, and WARP status.
- IPinfo's JSON endpoint provides its observed address and family, country,
  city, region, ASN, and network organization.

The two results are shown as separate provider observations. Their IP addresses
can differ when routes, address families, VPNs, or network policies differ, so
the app does not attach one provider's location or ASN to the other's IP. One
successful provider result does not establish that the device has both IPv4 and
IPv6 connectivity.

The requests run in the visitor's browser. Ping has no IP lookup backend and
does not add these values to latency history. Both endpoints support CORS and
require no API keys. IPinfo's unauthenticated legacy API is free and limited to
1,000 requests per day per client IP; failures leave the other provider's result
available.

## References

- [ip.skk.moe](https://ip.skk.moe/) — reference layout for provider-specific IP,
  location, ISP, and ASN details.
- [Cloudflare `/cdn-cgi/` endpoint](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/) —
  Cloudflare's trace endpoint and edge information.
- [Cloudflare routing and `colo`](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/geographic-traffic-routing/) —
  `colo` identifies the serving data center; anycast routing may not select the
  geographically closest one.
- [IPinfo free API options](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite) —
  unauthenticated legacy API fields and limits.
