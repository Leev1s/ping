# 参考页面与测量方案

调研日期：2026-10-31

## 参考页面观察

- [cf.090227.xyz 的「网络状态」页](https://cf.090227.xyz/#/network) 是该站多页中的默认首页。公开 HTML 将页面分成当前网络信息和延迟监测：四类出口 IP 卡片、隐私脱敏，以及按国内/国际分组的八个服务延迟卡片。每张延迟卡显示最近值和 16 个采样点的曲线。
- 该页公开脚本以 `performance.now()` 计时，附加随机查询参数并使用 `cache: no-store`，每 5 秒超时；每站持续追加样本并仅保留最新 16 次。网络页签在前台时才测量。当前探针通过 `fetch(..., { method: 'HEAD', mode: 'no-cors' })`，因而拿到的是不可读的 opaque 响应：它可以观察浏览器请求何时结束，却无法确认 HTTP 状态、是否被重定向或收到门户页。显示成“延迟”时不等同于对端可用性验证。
- [ip.skk.moe 首页](https://ip.skk.moe/) 把 IPv4/IPv6 出口、位置、ISP、ASN 与多家 IP 查询结果放在上方，并将字节跳动、Bilibili、微信、淘宝、GitHub、jsDelivr、Cloudflare、YouTube 的延迟放在下方。公开页面检索结果能确认这些字段与服务列表；网站目前会对直接页面访问提供 Cloudflare challenge，本次调研没有尝试绕过。
- 两个页面共同的核心是「我从当前网络访问不同服务时，出口与响应有何差别」。本项目应保留连续样本与国内/国际对照，把启动状态、最新 RTT、最近趋势和失败状态做成清楚的一屏；完整代理分流诊断与域名优选不属于这个单页工具的必要首发范围。

## 持续延迟测量建议

浏览器没有可由网页使用的原生 ICMP ping。`fetch` 测到的是 HTTP(S) 请求时间，结果受 DNS、TCP/TLS 建连或连接复用、服务边缘节点、缓存、浏览器调度和本机负载影响。界面称为「HTTP 延迟」或「请求耗时」，不要称为 ICMP ping。

1. 选择响应极小、可重复请求的公开端点；优先可读 CORS 响应，以校验 `response.ok`，只有 opaque 响应的目标应标记为「请求往返时间 / 未验证」，不能据此给出已确认在线状态。
2. 每轮为 URL 附加缓存键，使用 `cache: 'no-store'`、`performance.now()`、`AbortController` 和明确超时。样本同时记录成功、HTTP 错误、超时或不可读响应；失败不应伪造为某个大延迟数值。
3. 首次进入页面立即测量；稳定后可每 2–3 秒采样，保留最近约 30 个点。并发控制在 3–4 个请求，页面不可见时暂停，返回前台后立即恢复。用户可暂停/继续。限制请求速率可以减少对公共服务的负载，也避免把本地浏览器排队时间误当成网络往返。
4. 显示最新值与中位数；只有样本足够后才给抖动或丢失率。按目标分别计算，避免跨供应商平均。不要请求大型下载测速文件来获得 RTT；Cloudflare Speed Test 说明其 ping 是浏览器请求开始到首字节的时间（TTFB），而下载/上传测速会传输更大数据量。

### 可用的公开探针

| 目标 | 探针 | 可读性与用途 |
| --- | --- | --- |
| Cloudflare | `https://speed.cloudflare.com/__down?bytes=0` | HEAD 返回 200、空 body，响应头允许跨域读取且 `Cache-Control: no-store`。Cloudflare Speed Test 的公开源码也用此端点 `bytes=0` 读取请求到首字节耗时。适合作为首个可验证基准；这是 Speed Test 服务端点，不应视作长期稳定的商业 API 合约。 |
| jsDelivr | `https://cdn.jsdelivr.net/npm/latency-test@1.0.0/generate_200` | 本次 HEAD 返回 200 且 `Access-Control-Allow-Origin: *`，适合作为静态 CDN 探针。版本固定会让资源缓存长久存在；需要随机查询参数和 no-store 请求指令，并以浏览器实测确认边缘缓存行为。 |
| Google | `https://www.gstatic.com/generate_204` | Google 官方 ChromeOS 文档列为连接检查地址；本次 HEAD 返回 204，但没有发现 CORS 响应头。可用 `no-cors` 观察请求结束时间，无法验证状态/门户重定向；若要求在线确认，应不计入 verified 成功。 |
| Microsoft | `https://www.msftconnecttest.com/connecttest.txt` | Microsoft Learn 文档说明这是 Windows NCSI 探针。它是 HTTP 文本连通性检查，不是面向第三方的稳定 API；跨站读取受限时只能记录未验证往返，且 HTTP 内容探测可能被门户重定向。 |

端点证据：Cloudflare Speed Test [测量说明](https://speed.cloudflare.com/about)、[官方开源测量代码](https://github.com/cloudflare/speedtest)；Cloudflare 的 [`/cdn-cgi/` 文档](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/)说明 `https://<自有 Cloudflare 域名>/cdn-cgi/trace` 可用于查看处理请求的数据中心。Google 的 [ChromeOS allowlist 文档](https://support.google.com/chrome/a/answer/6334001?hl=en)列出 `www.gstatic.com/generate_204`；Microsoft 的 [NCSI 指南](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/troubleshoot-ncsi-guidance)列出 `msftconnecttest.com`。

## Magic UI

Magic UI 按组件源码拷贝进项目。用一个 [Number Ticker](https://magicui.design/docs/components/number-ticker) 给最新延迟变化增加轻微计数动画即可；它支持 `value`、`decimalPlaces`、`startValue`。不要让数字动画掩盖每轮采样实际值。Magic UI [GitHub 仓库](https://github.com/magicuidesign/magicui)采用 MIT 许可证；需要将所选组件源码与许可证要求一起纳入仓库。
