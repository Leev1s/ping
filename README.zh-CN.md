# Ping

Ping 是一个单页网络状态面板。它持续测量浏览器请求中国大陆四个服务和国际四个服务的 HTTP 响应时间，并使用固定范围的箱线图和单次测量点呈现近期结果。

[English](README.md) · [设计决策](docs/DESIGN.md) · [验收标准](docs/ACCEPTANCE.md)

> 读数表示浏览器发出请求到响应头可用所经过的时间，近似 TTFB；它不是 ICMP ping、带宽测速、丢包测量，也不是对整体网络质量的评分。

## 页面信息

- 八个探针分为「中国大陆」和「国际」两组，每组四项。每个探针独立显示最新读数、延迟分布、状态和统计结果。
- 每个探针使用横置箱线图：箱体表示 Q1–Q3，中线表示中位数，须线使用 Tukey 的 1.5 × IQR 规则。圆点表示近期有效测量；较早的点会逐渐变淡。
- 历史窗口可选 5、30 或 60 分钟。统计会使用窗口内所有有效样本。为保持绘制工作量固定，每张图最多显示 120 个点。
- 默认采用固定 log(1 + ms) 横轴，范围为 0–1,000 ms，可切换到 0–5,000 ms。新读数不会自动扩大横轴；超出范围的精确数值仍会显示。
- 连接信息来自 Cloudflare 和 IPinfo，并分开呈现，因为两家观察到的出口地址和元数据可能不同。

## 探针端点

每个探针访问一个体积较小的公开 HTTP 端点。请求从访问者浏览器直接发送给对应服务提供方。

| 区域 | 服务 | 端点 |
| --- | --- | --- |
| 中国大陆 | 百度 | `https://www.baidu.com/favicon.ico` |
| 中国大陆 | 哔哩哔哩 | `https://www.bilibili.com/favicon.ico` |
| 中国大陆 | 微信 | `https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico` |
| 中国大陆 | 淘宝 | `https://www.taobao.com/favicon.ico` |
| 国际 | Cloudflare | `https://speed.cloudflare.com/__down?bytes=0` |
| 国际 | Google | `https://www.gstatic.com/generate_204` |
| 国际 | GitHub | `https://github.com/favicon.ico` |
| 国际 | Microsoft | `https://www.bing.com/favicon.ico` |

Cloudflare 允许 CORS 请求，因此 Ping 可以读取其 HTTP 状态。其余七项使用 opaque `no-cors` 响应：Ping 可以计时，但无法确认 HTTP 状态，界面会将这些结果标为未验证。端点行为和可用性可能因地区和时间而变化。

页面加载后立即开始采样，默认间隔为五秒，可选 3、5、10 秒。八个目标分别采样，每个目标最多同时有一个进行中的请求；单次请求在 4.5 秒后超时。页面隐藏或浏览器离线时暂停采样，也可以手动暂停。

## 统计和历史记录

统计按单个探针和选定的时间窗口分别计算：

- **P50** 是有效响应时间的中位数。
- **P95** 使用最近秩法；至少有 40 个有效样本后才显示。
- **抖动**是时间相邻的有效响应时间之差的平均绝对值。失败请求会打断相邻配对。
- **尝试和失败**分开计数。HTTP 错误、超时和 fetch 失败不会作为有效延迟样本。opaque 响应可以计时，但其 HTTP 状态仍未验证。

每个探针在页面内存中最多保留最近 1,200 次尝试，八个探针合计最多 9,600 条。达到上限后采样会继续，新记录替换该探针最旧的记录。选定的时间窗口会进一步筛选这些历史记录。绘图点上限只影响图形；统计仍会使用窗口内所有符合条件的有效样本。刷新或关闭页面后，当前会话的历史会清空。详见[历史记录与内存说明](docs/HISTORY.md)。

## 连接信息和隐私

页面加载时，以及用户手动刷新时，浏览器会请求以下两个端点：

- Cloudflare Trace：`https://one.one.one.one/cdn-cgi/trace`，提供 Cloudflare 观察到的 IP 地址和地址族、国家代码、服务数据中心（`colo`）、TLS 版本及 WARP 状态。
- IPinfo：`https://ipinfo.io/json`，提供其观察到的地址和地址族、城市、地区、国家、ASN 和网络组织名称。

两个请求都由访问者浏览器直接发起，无需 API key。IPinfo 未认证的公开 API 每个来源 IP 每日限 1,000 次；共用一个公网 IP 的访问者会共享该限额，可能遇到速率限制。详见 [IPinfo 当前配额说明](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite)及[连接信息说明](docs/IP.md)。

Ping 没有服务端代理、账号、分析遥测或数据库。浏览器请求探针、Cloudflare 和 IPinfo 时，会向相应服务发送正常的网络连接信息。界面默认遮蔽 IP 地址；地址不会进入探针历史或 JSON 导出。导出文件包含保留的探针样本和每个探针的计数。

## 本地开发

需要 Node.js 22.12 或更新版本。

```sh
git clone https://github.com/Leev1s/ping.git
cd ping
npm ci
npm run dev
```

本地检查：

```sh
npm run check
npm test
npm run build
npx playwright install --with-deps chromium  # 首次运行浏览器测试时安装
npm run test:e2e
```

GitHub Actions 会在 push 和 pull request 时执行类型检查、单元测试、生产构建和浏览器测试。

## 部署到 Cloudflare Workers

项目通过 Wrangler 将 Vite 构建产物 `dist/` 作为静态资源托管，并启用单页应用回退。仓库中的配置为管理 `ping.r3.net.eu.org` 的 Cloudflare 账号绑定该自定义域名。

首次部署前，在交互式终端登录并部署：

```sh
npm ci
npx wrangler login
npm run build
npx wrangler deploy
```

部署命令使用 [`wrangler.jsonc`](wrangler.jsonc)。Fork 后，请先将 Worker 名称和自定义域路由改为自己 Cloudflare 账号中的域名，再运行 `npx wrangler deploy`。若要使用 `workers.dev` 地址，请移除自定义域路由，并在 Cloudflare 控制台为 Worker 启用 `workers.dev`。

## 字体、品牌和许可证

页面使用三款自托管字体：Space Grotesk 用于品牌和标题，Inter 用于界面文字，JetBrains Mono 用于测量数字。字体文件和 SIL Open Font License 1.1 许可证见 [`public/fonts/`](public/fonts/README.md)。访问页面时不会向第三方字体服务请求字体。品牌资产和视觉规范见 [`docs/BRAND.md`](docs/BRAND.md)。

源码仓库：[github.com/Leev1s/ping](https://github.com/Leev1s/ping)。项目采用 MIT 许可证。改编的 Magic UI Number Ticker 源码和许可证见 [`src/components/magicui/number-ticker.tsx`](src/components/magicui/number-ticker.tsx) 与 [`public/magicui-LICENSE`](public/magicui-LICENSE)。字体资产保留各自的 OFL 许可证。
