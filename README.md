# Ping · 网络状态

Ping 是中英双语的单屏网络状态页，持续显示四个中国大陆与四个国外公开服务的浏览器 HTTP 探测结果。界面使用固定范围的统计图和等宽数字；字体自托管，不请求远程字体。

> “延迟”表示浏览器请求到响应头可用的时间，近似 TTFB。它不是 ICMP ping，也不代表全网质量或服务端健康度。浏览器调度、网络路径和本地网络都会影响读数。

[English](README.en.md) · [验收标准](docs/ACCEPTANCE.md) · [产品与设计决策](docs/DESIGN.md)

相关研究：[多设备人机工学](docs/ERGONOMICS.md) · [固定范围界面](docs/STABLE-UI.md) · [统计呈现与 Cloudflare Speed Test](docs/STATISTICS.md)

## 页面功能

- 八个探针按「中国大陆」和「国外」分组，每组四项。每个固定大小的服务卡片显示最新延迟、最近 60 次的 P50 和响应状态；点击卡片可查看该目标的统计。
- 统计区显示所选目标的 P50、有效样本达到 40 个后才显示的 P95、相邻有效样本的平均延迟变化，以及失败次数/尝试总数。固定六档直方图的横轴为 `<50`、`50–100`、`100–250`、`250–500`、`500–1000`、`1000+ ms`，纵轴固定为 `0–100%`。新样本更新既有数字和区间计数，不扩张图表或页面布局。
- 支持 3、5、10 秒间隔、暂停和恢复；标签页进入后台时暂停采样，浏览器离线时中止当前请求。
- 中英文即时切换；出口 IP 默认隐藏，可手动显示。导出的 JSON 不含出口 IP；探测数据只留在页面内存中。
- 首页移除 slogan 和说明段落。常用尺寸在单屏内查看；布局、状态和数字为多种设备预留固定空间。

所有延迟统计均按单一目标计算。只有成功响应和可计时的 opaque 响应进入延迟分布；HTTP 错误、超时或请求失败单独计入“次数/尝试总数”。HTTP 错误虽有响应时间，也不作为有效网络延迟。该计数不代表丢包。opaque 跨域响应会明确标为未验证。说明和验收边界见[统计研究](docs/STATISTICS.md)。

## 探测目标

每轮并行请求以下免费公开端点：

| 区域 | 服务 | URL |
| --- | --- | --- |
| 中国大陆 | 百度 | `https://www.baidu.com/favicon.ico` |
| 中国大陆 | 哔哩哔哩 | `https://www.bilibili.com/favicon.ico` |
| 中国大陆 | 微信 | `https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico` |
| 中国大陆 | 淘宝 | `https://www.taobao.com/favicon.ico` |
| 国外 | Cloudflare | `https://speed.cloudflare.com/__down?bytes=0` |
| 国外 | Google | `https://www.gstatic.com/generate_204` |
| 国外 | GitHub | `https://github.com/favicon.ico` |
| 国外 | Microsoft | `https://www.bing.com/favicon.ico` |

只有 Cloudflare 探针通过 CORS 读取 HTTP 状态；其余七项采用 opaque 跨域探测，显示请求耗时但不能确认 HTTP 成功。页面加载时还会向 Cloudflare `one.one.one.one/cdn-cgi/trace` 请求出口国家/IP 和边缘节点信息；用户也可手动刷新。端点的访问策略、跨域行为与可用性由服务提供方决定，可能随地区和时间变化。

## 字体

页面使用且只使用三款本地自托管字体：**Inter**（拉丁界面文字）、**Noto Sans SC**（简体中文）和 **JetBrains Mono**（延迟数字）。三者使用 SIL Open Font License 1.1，许可证与更新步骤见 [public/fonts/README.md](public/fonts/README.md)。浏览页面时无需向 Google Fonts 请求字体。

## 本地开发

需要 Node.js 22.12 或更新版本。

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
npx playwright install --with-deps chromium  # 首次运行浏览器测试时安装
npm run test:e2e
```

GitHub Actions 会在每次 push 和 pull request 时执行类型检查、单元测试、生产构建与浏览器测试。

## 部署到 Cloudflare Workers

首次部署前用交互终端登录 Cloudflare：

```bash
npm ci
npx wrangler login
npm run build
npx wrangler deploy
```

[`wrangler.jsonc`](wrangler.jsonc) 从 `dist/` 托管静态资源、启用单页应用回退，并为托管 `r3.net.eu.org` 的 Cloudflare 账号绑定自定义域名 `ping.r3.net.eu.org`。Wrangler 会设置域名、DNS 和证书。上线地址为 [ping.r3.net.eu.org](https://ping.r3.net.eu.org)。

Fork 后部署到自己的域名时，请修改 Worker 名称和 `routes`；只想使用 Wrangler 提供的 `workers.dev` 域名时，可以移除 `routes`。GitHub Actions 默认仅执行 CI；如要自动部署，请在 GitHub Secrets 中提供 Cloudflare API Token 与 Account ID 并自行配置发布流程。

## API 与隐私

所有探测由访问者浏览器直接发往上表八个端点；连接概况来自 Cloudflare trace。Ping 不设置后端、账号、遥测或数据库。默认探测间隔是每个目标五秒，页面隐藏时暂停。访问目标会暴露普通的网络连接信息给相应服务提供方；Cloudflare trace 会收到访问者的 IP。IP 在页面里默认遮蔽，不写入探测历史或导出文件。

## 许可证

项目使用 MIT 许可证：[LICENSE](LICENSE)。Magic UI Number Ticker 的改编源码及原许可证见 [src/components/magicui/number-ticker.tsx](src/components/magicui/number-ticker.tsx) 和 [public/magicui-LICENSE](public/magicui-LICENSE)。字体各自保留其 OFL 1.1 许可证。
