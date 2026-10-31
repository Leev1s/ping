# Connection addresses

Ping requests IPv4 and IPv6 addresses independently from two public endpoints
when the page opens and when the connection panel is refreshed:

| Route | Provider | IPv4 | IPv6 |
| --- | --- | --- | --- |
| China | Tencent DNSPod | `ipv4.ddnspod.com/checkip` | `ipv6.ddnspod.com/checkip` |
| International | ICanHazIP | `ipv4.icanhazip.com/` | `ipv6.icanhazip.com/` |

The requests run directly in the browser and use CORS-enabled, unauthenticated
plain-text endpoints. The page does not proxy the responses through Ping or add
them to latency history. The two providers can observe different network exits,
so their addresses are shown separately.

The providers return addresses only; this view does not infer location or ISP
from an address. A source is marked unsupported only when its endpoint returns
HTTP 501. Other HTTP errors and browser network failures are shown as unavailable;
fetch cannot reliably tell a missing IP-family route apart from DNS, CORS, or
other connection errors.

## References

- [DNSPod services agreement](https://docs.dnspod.com/account/terms-of-service/) —
  identifies DNSPod as Tencent's service.
- [DNSPod overview](https://docs.dnspod.com/dns/dns-overview/)
- [Tencent DNSPod IPv4 endpoint](https://ipv4.ddnspod.com/checkip)
- [Tencent DNSPod IPv6 endpoint](https://ipv6.ddnspod.com/checkip)
- [ICanHazIP IPv4 endpoint](https://ipv4.icanhazip.com/)
- [ICanHazIP IPv6 endpoint](https://ipv6.icanhazip.com/)

Both endpoint pairs were read successfully from Chromium with a separate page
origin on 2026-10-31. Each returned HTTP 200 with `Access-Control-Allow-Origin: *`.
The DNSPod IPv4 host resolved through `cdn4-ct.ipv6-only.cn` to China Telecom
addresses; APNIC RDAP records the sampled IPv4 as `CN` / `CHINANET-JX` and the
sampled IPv6 host address as `CN` / `CT-IPV6-IDC-ADDRESS`. These are provider
edge addresses, not visitor addresses, and DNS answers can change. [IPv4 RDAP](https://rdap.apnic.net/ip/106.225.194.44), [IPv6 RDAP](https://rdap.apnic.net/ip/240e:96a:4000:36::af0c:1323).

ICanHazIP's original operator announced Cloudflare as its new owner and
operator in 2021 ([announcement](https://major.io/p/a-new-future-for-icanhazip/)).
