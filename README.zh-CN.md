# Ping

[![CI](https://github.com/Leev1s/ping/actions/workflows/ci.yml/badge.svg)](https://github.com/Leev1s/ping/actions/workflows/ci.yml)
[![许可证：MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[在线体验](https://ping.r3.net.eu.org) · [English](README.md)

Ping 是一个单页网络状态面板，持续测量浏览器到中国大陆和国际各四个探针的 HTTP 响应时间；两组延迟图表各自使用统一的动态范围。

- 查看每个探针的当前延迟、连通状态、P50/P95、抖动和近期分布。
- 分别查看大陆和海外来源返回的 IPv4、IPv6 出口地址，以及各自的可用状态。
- 默认每 3 秒采样，可自行调整；页面内存中的历史记录有固定上限。

测量由浏览器直接发起，计时到响应头返回为止；这不是 ICMP ping 或带宽测速。探针和 IP 服务请求直接发送给服务提供方；Ping 不经过服务端转发，也不做分析追踪。IP 地址默认显示，可手动隐藏，且不会写入探针历史或导出文件。后台测量会尽力持续，浏览器仍可能限速或暂停。

## 本地运行

需要 Node.js 22.12 或更新版本。

```sh
git clone https://github.com/Leev1s/ping.git
cd ping
npm ci
npm run dev
```

## 部署到 Cloudflare Workers

```sh
npm ci
npx wrangler login
npm run build
npx wrangler deploy
```

Fork 后，请在 [`wrangler.jsonc`](wrangler.jsonc) 中将 Worker 名称和自定义域名改为自己 Cloudflare 账号中的配置。

## 文档

[设计说明](docs/DESIGN.md) · [探针研究](docs/PROBE-RESEARCH.md) · [IP 信息](docs/IP.md) · [历史记录与内存](docs/HISTORY.md)

## 许可证

Ping 使用 MIT 许可证。字体保留 SIL Open Font License 许可说明；改编的 Magic UI 组件许可说明见 [`public/magicui-LICENSE`](public/magicui-LICENSE)。

<p align="center">
  <a href="https://www.cloudflare.com/press/press-kit/"><img src="docs/assets/cloudflare-logo.png" width="160" alt="Cloudflare"></a><br>
  感谢 Cloudflare 托管 Ping。
</p>
