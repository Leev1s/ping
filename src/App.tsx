import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Eye,
  EyeOff,
  Globe2,
  Languages,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Signal,
  Wifi,
  Zap,
} from "lucide-react";
import { NumberTicker } from "./components/magicui/number-ticker";
import { copy, preference, savePreference, type Lang } from "./lib/i18n";
import {
  TARGETS,
  probe,
  summarize,
  fetchConnection,
  type Sample,
} from "./lib/network";

type History = Record<string, Sample[]>;
type Connection = Awaited<ReturnType<typeof fetchConnection>>;
function Sparkline({
  samples,
  large = false,
  label,
}: {
  samples: Sample[];
  large?: boolean;
  label: string;
}) {
  const w = large ? 920 : 150,
    h = large ? 180 : 36,
    pad = large ? 12 : 3;
  const vals = samples.flatMap((s) => (s.latency === null ? [] : [s.latency]));
  const ceiling = Math.max(100, ...vals) * 1.15;
  const x = (i: number) => pad + (i / 59) * (w - 2 * pad);
  const y = (v: number) => h - pad - (v / ceiling) * (h - pad * 2);
  let path = "",
    active = false;
  samples.forEach((s, i) => {
    if (
      s.latency === null ||
      s.outcome === "error" ||
      s.outcome === "timeout"
    ) {
      active = false;
      return;
    }
    path += `${active ? "L" : "M"}${x(i)},${y(s.latency)} `;
    active = true;
  });
  return (
    <svg
      className={large ? "chart-svg" : "sparkline"}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {large &&
        [0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1="0"
            x2={w}
            y1={pad + (i * (h - 2 * pad)) / 3}
            y2={pad + (i * (h - 2 * pad)) / 3}
            className="gridline"
          />
        ))}
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={large ? 2.4 : 1.8}
        vectorEffect="non-scaling-stroke"
      />
      {samples.map((s, i) =>
        s.latency === null ||
        s.outcome === "error" ||
        s.outcome === "timeout" ? (
          <circle
            key={i}
            cx={x(i)}
            cy={h - pad}
            r={large ? 3 : 2}
            fill="#f18b80"
          />
        ) : i === samples.length - 1 || !large ? (
          <circle
            key={i}
            cx={x(i)}
            cy={y(s.latency)}
            r={large ? 4 : 1.5}
            fill="currentColor"
          />
        ) : null,
      )}
    </svg>
  );
}
export default function App() {
  const [lang, setLang] = useState<Lang>(() =>
    preference(
      "ping-language",
      navigator.language.startsWith("zh") ? "zh" : "en",
    ) === "zh"
      ? "zh"
      : "en",
  );
  const t = copy[lang];
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [online, setOnline] = useState(navigator.onLine);
  const [interval, setIntervalSeconds] = useState(() => {
    const saved = Number(preference("ping-interval", "5"));
    return [3, 5, 10].includes(saved) ? saved : 5;
  });
  const [history, setHistory] = useState<History>({});
  const [connection, setConnection] = useState<Connection | null>(null);
  const [infoState, setInfoState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [infoVersion, setInfoVersion] = useState(0);
  const [showIP, setShowIP] = useState(false);
  const [filter, setFilter] = useState<"all" | "global" | "cn">("all");
  const [notice, setNotice] = useState("");
  const [epoch, setEpoch] = useState(0);
  const running = !paused && visible && online;
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = `Ping · ${t.network}`;
    savePreference("ping-language", lang);
  }, [lang, t.network]);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    const net = () => setOnline(navigator.onLine);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const run = async (target: (typeof TARGETS)[number]) => {
      const started = performance.now();
      try {
        const sample = await probe(target, controller.signal);
        if (controller.signal.aborted) return;
        setHistory((prev) => ({
          ...prev,
          [target.id]: [...(prev[target.id] ?? []), sample].slice(-60),
        }));
      } catch {
        if (controller.signal.aborted) return;
      }
      if (!controller.signal.aborted) {
        const timer = setTimeout(
          () => {
            timers.delete(timer);
            void run(target);
          },
          Math.max(0, interval * 1000 - (performance.now() - started)),
        );
        timers.add(timer);
      }
    };
    TARGETS.forEach((target) => void run(target));
    return () => {
      controller.abort();
      timers.forEach(clearTimeout);
    };
  }, [running, interval, epoch]);
  useEffect(() => {
    const controller = new AbortController();
    setInfoState("loading");
    fetchConnection(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setConnection(result);
          setInfoState(result ? "ready" : "error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setInfoState("error");
      });
    return () => controller.abort();
  }, [infoVersion]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const primary = history[TARGETS[0].id] ?? [];
  const stats = useMemo(() => summarize(primary), [primary]);
  const latestAt = Math.max(
    0,
    ...Object.values(history).flatMap((items) =>
      items.length ? [items[items.length - 1].at] : [],
    ),
  );
  const total = Object.values(history).reduce(
    (sum, items) => sum + items.length,
    0,
  );
  const stateText = !online
    ? t.offline
    : paused
      ? t.paused
      : !visible
        ? t.hidden
        : t.live;
  const exportData = () => {
    const payload = {
      app: "Ping",
      version: 1,
      exportedAt: new Date().toISOString(),
      measurement:
        "Browser HTTP request duration; not ICMP ping. Opaque outcomes do not verify HTTP status.",
      intervalSeconds: interval,
      targets: TARGETS.map((target) => ({
        ...target,
        samples: history[target.id] ?? [],
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ping-${new Date().toISOString().replaceAll(":", "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(t.exportDone);
  };
  const metric = (value: number | null | undefined, suffix = "ms") => (
    <>
      {value == null ? (
        <span className="empty-value">—</span>
      ) : (
        <NumberTicker value={value} />
      )}
      <span className="unit">{suffix}</span>
    </>
  );
  const actual = primary.length ? primary[primary.length - 1] : null;
  const metrics = [
    {
      label: t.current,
      value: stats.latest,
      icon: Zap,
      foot: t.summary,
      suffix: "ms",
      accent: true,
    },
    {
      label: t.median,
      value: stats.median,
      icon: Activity,
      foot: t.window,
      suffix: "ms",
    },
    {
      label: t.jitter,
      value: stats.jitter,
      icon: Signal,
      foot: t.latencyNote,
      suffix: "ms",
    },
    {
      label: t.failures,
      value: stats.failureRate === null ? null : stats.failureRate,
      icon: ShieldCheck,
      foot: t.notLoss,
      suffix: "%",
    },
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="#" className="brand" aria-label="Ping">
          <span className="brand-icon">
            <Activity size={24} />
          </span>
          ping<span className="brand-dot">.</span>
          <span className="brand-divider" />
          <span className="brand-caption">{t.observatory}</span>
        </a>
        <div className="top-actions">
          <span className="local-label">
            <span className="tiny-dot" />
            {t.local}
          </span>
          <button
            className="language-button"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
          >
            <Languages size={15} />
            {lang === "zh" ? "EN" : "中文"}
          </button>
          <a
            className="github-link"
            href="https://github.com/Leev1s/ping"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 5.2 18.3 5.5 18.3 5.5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.7-5.5 6 .5.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
            </svg>
          </a>
        </div>
      </header>
      <main>
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="slash">//</span> {t.network}{" "}
              <span className="version">V1.0</span>
            </div>
            <h1>
              {t.title}
              <span className="heading-dot" />
            </h1>
            <p>{t.subtitle}</p>
          </div>
          <div className="heading-right">
            <span className={`live-badge ${running ? "" : "inactive"}`}>
              <span className="status-dot" />
              {stateText}
            </span>
            <span className="updated">
              {t.last}{" "}
              <span>
                {latestAt
                  ? new Date(latestAt).toLocaleTimeString(
                      lang === "zh" ? "zh-CN" : "en-GB",
                      { hour12: false },
                    )
                  : "—"}
              </span>
            </span>
          </div>
        </section>
        <div className="toolbar">
          <div className="toolbar-start">
            <Radio size={15} />
            <span>{t.overview}</span>
            <span className="toolbar-separator" />
            <span className="sampling-note">{t.tab}</span>
          </div>
          <div className="controls">
            <label className="interval-control">
              <span>{t.interval}</span>
              <select
                aria-label={t.interval}
                value={interval}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setIntervalSeconds(value);
                  savePreference("ping-interval", String(value));
                }}
              >
                <option value="3">3 {t.seconds}</option>
                <option value="5">5 {t.seconds}</option>
                <option value="10">10 {t.seconds}</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <button
              className={`button ${paused ? "primary" : ""}`}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
              <span>{paused ? t.resume : t.pause}</span>
            </button>
            <button className="button export-button" onClick={exportData}>
              <ArrowDownToLine size={14} />
              <span>{t.export}</span>
            </button>
          </div>
        </div>
        <section className="metric-grid" aria-label={t.overview}>
          {metrics.map(({ label, value, icon: Icon, foot, suffix, accent }) => (
            <article
              key={label}
              className={`metric-card ${accent ? "metric-accent" : ""}`}
            >
              <div className="metric-top">
                <span>{label}</span>
                <Icon size={16} />
              </div>
              <div className="metric-value">{metric(value, suffix)}</div>
              <div className="metric-foot">
                <span
                  className={`small-indicator ${accent && actual?.outcome === "ok" ? "green" : ""}`}
                />
                {foot}
              </div>
            </article>
          ))}
        </section>
        <div className="dashboard-grid">
          <div className="main-column">
            <section className="panel timeline">
              <div className="panel-heading">
                <div>
                  <h2>{t.history}</h2>
                  <p>{t.historySub}</p>
                </div>
                <span className="chart-tag">
                  <span className="tiny-dot" />
                  HTTP
                </span>
              </div>
              <div className="chart-wrap">
                <div className="chart-axis">
                  <span>
                    {Math.ceil(
                      Math.max(100, ...primary.map((s) => s.latency ?? 0)) *
                        1.15,
                    )}{" "}
                    ms
                  </span>
                  <span>0 ms</span>
                </div>
                <div className="chart-content">
                  <Sparkline
                    samples={primary}
                    large
                    label={`${t.history}: ${primary.map((s) => (s.latency === null ? t.error : Math.round(s.latency) + " ms")).join(", ")}`}
                  />
                  {!primary.length && (
                    <div className="chart-empty">
                      <Activity size={22} />
                      <span>{t.noData}</span>
                    </div>
                  )}
                  <div className="chart-bottom">
                    <span>01</span>
                    <span>15</span>
                    <span>30</span>
                    <span>45</span>
                    <span>60</span>
                  </div>
                </div>
              </div>
              <div className="chart-footer">
                <span>
                  <span className="line-key" />
                  Cloudflare <span className="muted">/ {t.range}</span>
                </span>
                <span>
                  {primary.length} / 60{" "}
                  <span className="muted">{t.samples}</span>
                </span>
              </div>
            </section>
            <section className="panel services">
              <div className="panel-heading">
                <div>
                  <h2>
                    {t.endpoints}
                    <span className="count-badge">
                      {TARGETS.length.toString().padStart(2, "0")}
                    </span>
                  </h2>
                  <p>{t.endpointsSub}</p>
                </div>
                <div className="filters" role="group" aria-label={t.endpoints}>
                  {(["all", "global", "cn"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      aria-pressed={filter === f}
                      className={filter === f ? "selected" : ""}
                    >
                      {t[f]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="service-table">
                <div className="table-header">
                  <span>{t.service}</span>
                  <span>{t.response}</span>
                  <span>{t.trend}</span>
                  <span>{t.status}</span>
                </div>
                {TARGETS.filter(
                  (target) => filter === "all" || target.region === filter,
                ).map((target, index) => {
                  const samples = history[target.id] ?? [];
                  const last = samples.at(-1);
                  const status = !last
                    ? t.waiting
                    : last.outcome === "unverified"
                      ? t.unverified
                      : last.outcome === "timeout"
                        ? t.timeout
                        : last.outcome === "error"
                          ? t.error
                          : (last.latency ?? 0) > 500
                            ? t.slow
                            : t.healthy;
                  const color = !last
                    ? "muted"
                    : last.outcome === "ok"
                      ? "green"
                      : last.outcome === "unverified"
                        ? "amber"
                        : "red";
                  return (
                    <div className="service-row" key={target.id}>
                      <div className="service-name">
                        <span className={`provider-icon provider-${target.id}`}>
                          {index === 0 && target.id === TARGETS[0].id ? (
                            <Globe2 size={19} />
                          ) : (
                            target.name.slice(0, 1)
                          )}
                        </span>
                        <div>
                          <strong>
                            {target.name}
                            <span className="region-tag">
                              {t[target.region]}
                            </span>
                          </strong>
                          <span className="service-domain">
                            {new URL(target.url).hostname}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`service-latency ${last?.latency == null ? "muted" : ""}`}
                      >
                        {last?.latency == null ? "—" : Math.round(last.latency)}
                        <span>ms</span>
                      </div>
                      <Sparkline
                        samples={samples}
                        label={`${target.name} ${t.trend}`}
                      />
                      <span className={`service-status ${color}`}>
                        <span className="tiny-dot" />
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="services-footer">
                <span>
                  <ShieldCheck size={13} />
                  {t.sampleNote}
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    setEpoch((e) => e + 1);
                    setHistory({});
                    setNotice(t.clearDone);
                  }}
                >
                  <RotateCcw size={12} />
                  {t.reset}
                </button>
              </div>
            </section>
          </div>
          <aside className="side-column">
            <section className="panel connection">
              <div className="panel-heading">
                <h2>{t.connection}</h2>
                <button
                  className="icon-button"
                  aria-label={t.refresh}
                  onClick={() => setInfoVersion((v) => v + 1)}
                  disabled={infoState === "loading"}
                >
                  <RefreshCw
                    size={14}
                    className={infoState === "loading" ? "spin" : ""}
                  />
                </button>
              </div>
              <div className="connection-visual">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="orbit orbit-three" />
                <div className="wifi-orb">
                  <Wifi size={34} strokeWidth={1.5} />
                </div>
                <span className="visual-status">
                  <span className="tiny-dot" />
                  {online ? t.onlineLabel : t.offlineLabel}
                </span>
              </div>
              <div className="ip-box">
                <div>
                  <span>{t.ip}</span>
                  <button
                    className="icon-button"
                    aria-label={showIP ? t.conceal : t.reveal}
                    onClick={() => setShowIP(!showIP)}
                  >
                    {showIP ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <strong>
                  {connection?.ip
                    ? showIP
                      ? connection.ip
                      : "•••.•••.•••.•••"
                    : "—"}
                </strong>
                <span className="ip-caption">{t.connectionNote}</span>
              </div>
              {infoState !== "ready" && (
                <p className="info-message" role="status">
                  {infoState === "loading" ? t.infoLoading : t.infoError}
                </p>
              )}
              <dl className="connection-details">
                <div>
                  <dt>{t.country}</dt>
                  <dd>{connection?.country ?? "—"}</dd>
                </div>
                <div>
                  <dt>{t.edge}</dt>
                  <dd>{connection?.colo ?? "—"}</dd>
                </div>
                <div>
                  <dt>{t.protocol}</dt>
                  <dd>{connection?.tls ?? "—"}</dd>
                </div>
              </dl>
              <div className="privacy-label">
                <ShieldCheck size={13} />
                {t.privacy}
              </div>
            </section>
            <section className="method-panel" id="methodology">
              <span className="method-icon">
                <CircleHelp size={18} />
              </span>
              <h2>{t.methodology}</h2>
              <p>{t.methodText}</p>
              <div className="method-divider" />
              <p>{t.privacyText}</p>
              <span className="free-label">
                <Check size={12} />
                {t.free}
              </span>
            </section>
            <div className="connection-route">
              <span>{t.route}</span>
              <div>
                <span>
                  <Signal size={13} />
                  {t.device}
                </span>
                <span className="route-dashes" />
                <ArrowUpRight size={14} />
                <span>{t.provider}</span>
              </div>
            </div>
          </aside>
        </div>
        <div className="bottom-note">
          <span>
            <CircleHelp size={13} />
            {t.legend}
          </span>
          <span>
            {t.total} <b>{total}</b> {t.attempt}{" "}
            <span className="bottom-divider">/</span> P95{" "}
            <b>{stats.p95 === null ? "—" : Math.round(stats.p95)}</b> ms
          </span>
        </div>
      </main>
      <footer>
        <a href="#" className="footer-brand">
          ping<span>.</span>
        </a>
        <span>{t.footer}</span>
        <div>
          <a href="#methodology">
            {t.methodLink}
            <ArrowUpRight size={11} />
          </a>
          <a
            href="https://github.com/Leev1s/ping"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
            <ArrowUpRight size={11} />
          </a>
          <span>© {new Date().getFullYear()} Ping</span>
        </div>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
