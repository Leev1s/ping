# Ping · 网络状态

一个用来观察当前网络状态的中英双语单页应用。它持续测量浏览器发起 HTTP 请求到收到响应头的时间，并展示近期趋势与连接概况。

> 这里的“延迟”是浏览器请求到响应头可供 JavaScript 读取的耗时（近似首字节时间），不是等待完整响应体的时间，也不是 ICMP ping。它不代表完整网络质量或服务端健康度，且会受跨域行为、浏览器调度和本地网络影响。

[GitHub](https://github.com/Leev1s/ping) · [English](README.en.md) · [验收标准](docs/ACCEPTANCE.md)

[产品与设计决策](docs/DESIGN.md) · [Reference research](docs/RESEARCH.md)

## 功能

- 持续测量 5 个公开服务；查看各目标最近 60 次趋势，并查看 Cloudflare 探测的当前值、中位数、P95、抖动与失败率。
- 可暂停测量，选择 3、5 或 10 秒间隔；页面隐藏时暂停，网络离线时中止当前请求。
- 中文和英文界面；语言和采样间隔保存在本机浏览器。
- 默认隐藏 IP 地址；手动导出的 JSON 只包含探测结果，不包含 IP。
- TypeScript + React + Vite，采用 Magic UI 的 Number Ticker 组件，无自建后端或数据库。

## 探测目标

每轮会并行请求以下免费公开端点。浏览器可读取 Cloudflare 的 HTTP 状态；其余跨域端点使用不透明请求，只能显示请求耗时，不能据此确认服务返回成功。

| 服务 | URL |
| --- | --- |
| Cloudflare | `https://speed.cloudflare.com/__down?bytes=0` |
| Google | `https://www.gstatic.com/generate_204` |
| GitHub | `https://github.com/favicon.ico` |
| 百度 | `https://www.baidu.com/favicon.ico` |
| 哔哩哔哩 | `https://www.bilibili.com/favicon.ico` |

页面加载时另向 `https://one.one.one.one/cdn-cgi/trace` 请求一次连接信息；点击“刷新连接信息”会再次请求。各端点的访问策略和可用性由服务提供方决定，可能变化或在特定网络中不可达。

## 本地运行

需要 Node.js 22 或更新的 LTS 版本。

```bash
git clone https://github.com/Leev1s/ping.git
cd ping
npm ci
npm run dev
```

## 检查

```bash
npm run check
npm test
npm run build
# 浏览器验收（首次安装 Chromium）
npx playwright install --with-deps chromium
npm run test:e2e
```

GitHub Actions 会在每次 push 和 pull request 中运行上述检查。

## 部署到 Cloudflare Workers

先安装 Node.js/npm，并准备一个 Cloudflare 账号。首次部署需要在交互终端完成授权：

```bash
npm ci
npx wrangler login
npm run build
npx wrangler deploy
```

`wrangler.jsonc` 将 `dist/` 配置为静态资源目录、启用单页应用回退，并为同一 Cloudflare 账号中已托管的 `r3.net.eu.org` 配置自定义域名 `ping.r3.net.eu.org`。Wrangler 会自动配置域名路由、DNS 和证书，无需另行手动设置。部署后可访问 [ping.r3.net.eu.org](https://ping.r3.net.eu.org)。

若 fork 后部署到自己的域名，先将 `wrangler.jsonc` 中的 `name` 改为你的 Worker 名称，并把 `routes` 改成你账号中 Cloudflare 托管的域名；若暂时不使用自定义域名，可删去 `routes`，部署到 Wrangler 提供的 `workers.dev` 地址。

也可以在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`，再配置 GitHub Actions 自动部署。API Token 只存放在 GitHub Secrets 中；默认流程只做 CI，不会自动发布。

## 公开 API 与隐私

探测只从访问者的浏览器直接请求上表中的公开服务；连接概况使用 Cloudflare `one.one.one.one/cdn-cgi/trace`，读取出口 IP、国家/地区和 Cloudflare 边缘节点。接口免费公开使用；服务条款、可用性、速率限制和跨域策略由各服务提供方决定，可能随时变化。项目不承诺这些服务持续可用。

探测会产生真实的网络请求：默认每 5 秒向每个目标发送一次检查，页面隐藏时暂停；较短间隔会增加请求量。连接信息在页面加载时自动查询一次。项目没有后端、遥测或远程字体；采样记录只保留在当前页面内存中，语言与采样间隔保存在本机浏览器。IP 默认在界面遮蔽，用户可主动揭示；它不写入探测历史或导出 JSON。Cloudflare 作为连接信息请求的接收方会看到访问者的 IP，所有探测服务也会看到正常的连接信息。

## 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE)。改编自 Magic UI 的 Number Ticker 源码与其许可证见 [public/magicui-LICENSE](public/magicui-LICENSE)。
