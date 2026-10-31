# Ping

Ping 是一个单页网络状态面板，持续测量浏览器请求中国大陆四个服务和国际四个服务的 HTTP 响应时间，并呈现每个探针的最新读数和近期分布。

[English](README.md) · [设计决策](docs/DESIGN.md) · [验收标准](docs/ACCEPTANCE.md)

> 读数表示浏览器发出请求到响应头可用所经过的时间，近似 TTFB；它不是 ICMP ping、带宽测速、丢包测量，也不是对整体网络质量的评分。

## 页面与控制

- 八个探针分为「中国大陆」和「国际」两组，每组四项。每个探针显示最新读数、状态、横置箱线图和测量点、P50、P95、抖动及尝试计数。
- 图表使用固定的线性 0–1,000 ms 横轴，不会自动缩放。超过 1,000 ms 的读数仍显示精确数值，并在图表边缘标记。
- 历史窗口固定为最近 30 分钟。每张图最多绘制 120 个有效测量点；较早的点会更透明。
- 顶部按钮从左到右是：显示实时或暂停状态及采样间隔的图表按钮、配色选择、更多选项。共提供 Light、Dark、Gruvbox 和 Nord 四套配色。
- 更多选项包含手动间隔输入和应用按钮、导出数据、清空历史及 GitHub 链接。间隔可设置为 1–300 秒，也支持小数；默认是 3 秒。无效或超出范围的值不会应用。配色和采样间隔会保存在当前浏览器中。

## 探针端点

请求由访问者的浏览器直接发送给以下公开端点；Ping 不会代为转发。

| 区域 | 服务 | 端点 |
| --- | --- | --- |
| 中国大陆 | 百度 | https://www.baidu.com/favicon.ico |
| 中国大陆 | 哔哩哔哩 | https://www.bilibili.com/favicon.ico |
| 中国大陆 | 微信 | https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico |
| 中国大陆 | 淘宝 | https://www.taobao.com/favicon.ico |
| 国际 | Cloudflare | https://speed.cloudflare.com/__down?bytes=0 |
| 国际 | jsDelivr | https://cdn.jsdelivr.net/npm/latency-test@1.0.0/generate_200 |
| 国际 | GitHub | https://github.com/favicon.ico |
| 国际 | Microsoft | https://www.bing.com/favicon.ico |

Cloudflare 和 jsDelivr 使用 CORS 请求，因此浏览器可以读取 HTTP 状态。其余六个探针使用 opaque no-cors 响应：Ping 可以计时，但无法确认 HTTP 状态，会将这些读数标为未验证。jsDelivr 地址指向由 jsDelivr 分发的第三方 npm 包中的固定版本空响应，并非 jsDelivr 自有的测速 API。当前浏览器测试确认该响应可通过 CORS 读取，但测试不是从中国大陆发起的，也不能证明请求会被路由到哪里。详见[探针端点研究](docs/PROBE-RESEARCH.md)。端点可用性、地区路由和提供方行为都可能变化。

## 采样、统计和历史记录

页面加载后开始采样。页面可见、浏览器在线且未暂停时会持续运行。每个目标独立采样，同一个目标最多只有一个进行中的请求；单次请求在 4.5 秒后超时。顶部的实时状态按钮可以暂停或恢复采样。

每个探针的统计使用固定的最近 30 分钟内有效样本：

- **P50** 是中位数。
- **P95** 使用最近秩法，从有第一个有效读数时开始显示。有效读数少于 40 个时，数值前带 `~`，表示这是样本量较小的早期估计；达到 40 个后去掉 `~`。这只是描述性提示，不是总体置信区间或保证。只有没有有效读数时才显示 `—`。
- **抖动**是时间相邻的有效响应时间之差的平均绝对值。失败请求会打断相邻配对。
- **尝试和失败**分开计数。HTTP 错误、超时和 fetch 失败不会作为有效延迟样本。opaque 响应可以计时，但其 HTTP 状态仍未验证。

有五个有效测量后显示箱线图。箱体表示 Q1–Q3，中线表示中位数，须线使用 Tukey 的 1.5 × IQR 规则。测量点（包括离群点）仍会呈现；图上的位置限制在固定的 0–1,000 ms 范围内。

每个探针在页面内存中最多保留最近 1,200 次尝试（包括失败），八个探针合计最多 9,600 条。默认每 3 秒采样时，这个上限约覆盖 60 分钟，足以呈现固定的 30 分钟窗口。最短的 1 秒间隔下，上限约覆盖 20 分钟，此时固定窗口会使用仍保留的样本。达到上限后采样和会话计数仍会继续，每个目标的新记录会替换该目标最旧的记录。120 个绘图点的上限不影响统计使用的样本。刷新或关闭页面后，当前会话历史会清空。详见[历史记录与内存说明](docs/HISTORY.md)。

## 连接信息和隐私

页面加载后，以及用户点击连接信息卡片上的刷新按钮时，浏览器会请求：

- Cloudflare Trace（https://one.one.one.one/cdn-cgi/trace）：Cloudflare 观察到的地址和地址族、国家代码、处理请求的数据中心（colo）、TLS 版本及 WARP 状态。
- IPinfo（https://ipinfo.io/json）：IPinfo 观察到的地址和地址族、城市、地区、国家、ASN 和网络组织名称。

两家观察到的地址和元数据可能不同，所以会分开呈现。两个请求都由访问者浏览器直接发起，无需 API key。IPinfo 未认证的公开 API 每个来源 IP 每日限 1,000 次；共用一个公网 IP 的访问者会共享该限额，可能遇到速率限制。详见 [IPinfo 当前配额说明](https://support.ipinfo.io/hc/en-us/articles/34121895556242-Legacy-Free-API-vs-IPinfo-Lite)及[连接信息说明](docs/IP.md)。

Ping 没有服务端代理、账号、分析遥测或数据库。提供方会收到访问者正常网络连接所需的连接信息。界面默认遮蔽 IP 地址；地址不会加入内存中的探针历史或 JSON 导出。只有配色和间隔偏好会保存在浏览器本地；刷新或关闭页面后，会话样本会清空。导出文件包含保留的探针样本和计数，不包含连接地址。

## 本地开发

需要 Node.js 22.12 或更新版本。

    git clone https://github.com/Leev1s/ping.git
    cd ping
    npm ci
    npm run dev

本地检查：

    npm run check
    npm test
    npm run build
    npx playwright install --with-deps chromium  # 首次运行浏览器测试时安装
    npm run test:e2e

GitHub Actions 会在 push 和 pull request 时执行类型检查、单元测试、生产构建和浏览器测试。

## 部署到 Cloudflare Workers

Wrangler 将 Vite 构建产物 dist/ 作为静态资源托管，并启用单页应用回退。仓库中的配置为管理 ping.r3.net.eu.org 的 Cloudflare 账号绑定该自定义域名。

首次部署前，在交互式终端登录并部署：

    npm ci
    npx wrangler login
    npm run build
    npx wrangler deploy

部署命令使用 [wrangler.jsonc](wrangler.jsonc)。Fork 后，请先将 Worker 名称和自定义域路由改为自己 Cloudflare 账号中的域名，再运行部署命令。若要使用 workers.dev 地址，请移除自定义域路由，并在 Cloudflare 控制台为 Worker 启用 workers.dev。

## 字体、品牌和许可证

页面使用三款自托管字体：Space Grotesk 用于品牌和标题，Inter 用于界面文字，JetBrains Mono 用于测量数字。字体文件和 SIL Open Font License 1.1 许可证见 [public/fonts/](public/fonts/README.md)。访问页面时不会向第三方字体服务请求字体。品牌资产和视觉规范见 [docs/BRAND.md](docs/BRAND.md) 与 [docs/THEMES.md](docs/THEMES.md)。

源码仓库：[github.com/Leev1s/ping](https://github.com/Leev1s/ping)。项目采用 MIT 许可证。改编的 Magic UI Number Ticker 和 Magic Card 组件及许可证见 [src/components/magicui/](src/components/magicui/) 与 [public/magicui-LICENSE](public/magicui-LICENSE)。字体资产保留各自的 OFL 许可证。
