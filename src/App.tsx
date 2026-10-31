import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleCheck,
  CircleHelp,
  Ellipsis,
  Eye,
  EyeOff,
  Globe2,
  Github,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { NumberTicker } from "./components/magicui/number-ticker";
import { TARGETS, probe, type Sample, type ProbeTarget } from "./lib/network";
import { fetchConnectionInfo, type ConnectionReport } from "./lib/connection";
import {
  appendSample,
  HISTORY_LIMIT,
  plotHistory,
  selectRecentHistory,
} from "./lib/history";
import { hasLatency, statistics } from "./lib/statistics";

type ProbeHistory = { samples: Sample[]; total: number; failures: number };
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const EMPTY: ProbeHistory = { samples: [], total: 0, failures: 0 };
const AVATARS: Record<string, string> = {
  baidu: "BD",
  bilibili: "BL",
  wechat: "WX",
  taobao: "TB",
  cloudflare: "CF",
  google: "G",
  github: "GH",
  microsoft: "MS",
};
const number = (value: number | null) =>
  value === null ? "—" : Math.round(value).toLocaleString("en-US");

function ProbePlot({
  samples,
  now,
  windowMs,
  scale,
  stats,
}: {
  samples: Sample[];
  now: number;
  windowMs: number;
  scale: number;
  stats: ReturnType<typeof statistics>;
}) {
  const marks = plotHistory(samples.filter(hasLatency), now, windowMs);
  const position = (value: number) =>
    3 +
    (Math.log1p(Math.min(scale, Math.max(0, value))) / Math.log1p(scale)) * 94;
  const x = (value: number) => `${position(value)}%`;
  const overflow = samples.filter(
    (sample) => hasLatency(sample) && sample.latency > scale,
  ).length;
  return (
    <div className="plot-frame">
      <svg
        className="boxplot"
        data-scale={scale}
        role="img"
        aria-label={`HTTP latency, ${stats.count} valid samples. Median ${number(stats.median)} ms, Q1 ${number(stats.q1)}, Q3 ${number(stats.q3)}. ${overflow} readings above ${scale} ms.`}
      >
        <title>
          Box: Q1–Q3. Line: median. Whiskers: 1.5×IQR. Dots: measurements, older
          points fade. Fixed log(1 + ms) axis.
        </title>
        {[0, 10, 100, scale].map((tick) => (
          <line
            className="plot-gridline"
            key={tick}
            x1={x(tick)}
            x2={x(tick)}
            y1="6%"
            y2="94%"
          />
        ))}
        {stats.count >= 5 &&
          stats.q1 !== null &&
          stats.q3 !== null &&
          stats.low !== null &&
          stats.high !== null && (
            <>
              <line
                className="whisker"
                x1={x(stats.low)}
                x2={x(stats.high)}
                y1="28%"
                y2="28%"
              />
              {[stats.low, stats.high].map((v, i) => (
                <line
                  className="whisker"
                  key={i}
                  x1={x(v)}
                  x2={x(v)}
                  y1="15%"
                  y2="41%"
                />
              ))}
              <rect
                className="iqr-box"
                x={x(stats.q1)}
                y="11%"
                width={`${Math.max(0.4, position(stats.q3) - position(stats.q1))}%`}
                height="34%"
                rx="1"
              />
              <line
                className="median-line"
                x1={x(stats.median!)}
                x2={x(stats.median!)}
                y1="11%"
                y2="45%"
              />
            </>
          )}
        {marks.map(({ sample, opacity }, i) => (
          <circle
            className={`sample-point ${sample.latency! > scale ? "is-overflow" : ""}`}
            key={`${sample.at}-${i}`}
            cx={x(sample.latency!)}
            cy={`${69 + ((Math.floor(sample.at) % 13) - 6) * 1.6}%`}
            r="2"
            opacity={opacity}
          >
            <title>
              {timeFormat.format(sample.at)} · {number(sample.latency)} ms
            </title>
          </circle>
        ))}
        {overflow > 0 && (
          <path
            className="overflow-marker"
            d="M-4 -3L0 0L-4 3"
            transform="translate(0 0)"
            style={{ transform: "translate(calc(100% - 1px), 28%)" }}
          />
        )}
      </svg>
      <div
        className="plot-axis"
        aria-label="Fixed logarithmic millisecond scale"
      >
        {[0, 10, 100, scale].map((tick, i) => (
          <span
            key={tick}
            style={{
              left: x(tick),
              transform:
                i === 0
                  ? "none"
                  : i === 3
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {tick >= 1000 ? `${tick / 1000}k` : tick}
            {i === 3 ? " ms" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [online, setOnline] = useState(navigator.onLine);
  const [interval, setIntervalSeconds] = useState(() => {
    try {
      const n = Number(localStorage.getItem("ping-interval") ?? 5);
      return [3, 5, 10].includes(n) ? n : 5;
    } catch {
      return 5;
    }
  });
  const [windowMinutes, setWindowMinutes] = useState(5);
  const [scale, setScale] = useState(1000);
  const [history, setHistory] = useState<Record<string, ProbeHistory>>({});
  const [now, setNow] = useState(Date.now);
  const [startedAt, setStartedAt] = useState(Date.now);
  const [connection, setConnection] = useState<ConnectionReport>({
    cloudflare: null,
    ipinfo: null,
  });
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [infoVersion, setInfoVersion] = useState(0);
  const [showAddresses, setShowAddresses] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [epoch, setEpoch] = useState(0);
  const menu = useRef<HTMLDialogElement>(null);
  const running = !paused && visible && online;
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
    if (!visible) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible]);
  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const run = async (target: ProbeTarget) => {
      const started = performance.now();
      try {
        const sample = await probe(target, controller.signal);
        if (controller.signal.aborted) return;
        setNow(sample.at);
        setHistory((prev) => {
          const h = prev[target.id] ?? EMPTY;
          return {
            ...prev,
            [target.id]: {
              samples: appendSample(h.samples, sample),
              total: h.total + 1,
              failures:
                h.failures +
                (sample.outcome === "error" || sample.outcome === "timeout"
                  ? 1
                  : 0),
            },
          };
        });
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
    setConnectionLoading(true);
    fetchConnectionInfo(controller.signal)
      .then((report) => {
        if (!controller.signal.aborted) {
          setConnection(report);
          setConnectionLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setConnectionLoading(false);
      });
    return () => controller.abort();
  }, [infoVersion]);
  useEffect(() => {
    if (menuOpen) menu.current?.showModal();
    else menu.current?.close();
  }, [menuOpen]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2200);
    return () => clearTimeout(timer);
  }, [notice]);
  const total = Object.values(history).reduce((sum, h) => sum + h.total, 0);
  const retained = Object.values(history).reduce(
    (sum, h) => sum + h.samples.length,
    0,
  );
  const failures = Object.values(history).reduce(
    (sum, h) => sum + h.failures,
    0,
  );
  const duration = Math.max(0, Math.floor((now - startedAt) / 1000));
  const elapsed = `${Math.floor(duration / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((duration % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(duration % 60).toString().padStart(2, "0")}`;
  const stateText = !online
    ? "Offline"
    : paused
      ? "Paused"
      : !visible
        ? "Hidden"
        : "Live";
  const exportData = () => {
    const payload = {
      app: "Ping",
      version: 3,
      exportedAt: new Date().toISOString(),
      startedAt: new Date(startedAt).toISOString(),
      intervalSeconds: interval,
      windowMinutes,
      retentionLimit: HISTORY_LIMIT,
      measurement:
        "Browser HTTP time to response headers; not ICMP. Opaque timings do not verify HTTP status.",
      targets: TARGETS.map((target) => ({
        ...target,
        ...(history[target.id] ?? EMPTY),
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
    setNotice("Exported without addresses");
    setMenuOpen(false);
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Ping">
          <img src="/brand/wordmark.svg" width="112" height="32" alt="Ping" />
        </a>
        <h1>Network status</h1>
        <div className="toolbar">
          <span className={`status-badge ${running ? "is-live" : ""}`}>
            <span className="status-dot" />
            {stateText}
            <span className="cadence">{interval}s</span>
          </span>
          <label className="history-control">
            <span>History</span>
            <select
              aria-label="History window"
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(Number(e.target.value))}
            >
              {[5, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n}m
                </option>
              ))}
            </select>
          </label>
          <button
            className="control"
            aria-label={paused ? "Resume" : "Pause"}
            title={paused ? "Resume" : "Pause"}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            className="control"
            aria-label="More options"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Ellipsis size={20} />
          </button>
        </div>
      </header>
      <main>
        <section
          className="connection-panel"
          aria-label="Connection information"
        >
          <div className="connection-heading">
            <h2>Your connection</h2>
            <div>
              <button
                className="control"
                aria-label={showAddresses ? "Hide addresses" : "Show addresses"}
                title={showAddresses ? "Hide addresses" : "Show addresses"}
                onClick={() => setShowAddresses(!showAddresses)}
              >
                {showAddresses ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button
                className="control"
                aria-label="Refresh connection info"
                title="Refresh connection info"
                disabled={connectionLoading}
                onClick={() => setInfoVersion((n) => n + 1)}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          <div className="connection-cards">
            {(["cloudflare", "ipinfo"] as const).map((provider) => {
              const data = connection[provider];
              const location = [data?.city, data?.region, data?.countryCode]
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ");
              return (
                <article
                  className="connection-card"
                  data-provider={provider}
                  key={provider}
                >
                  <div className="exit-heading">
                    <span className={`provider-mark ${provider}`}>
                      {provider === "cloudflare" ? "CF" : "IP"}
                    </span>
                    <h3>
                      {provider === "cloudflare" ? "Cloudflare" : "IPinfo"}
                      <span>exit</span>
                    </h3>
                    <span className="ip-family">{data?.family ?? "—"}</span>
                  </div>
                  <div
                    className={`exit-address ${!data ? "is-unavailable" : ""}`}
                    title={showAddresses ? data?.ip : undefined}
                  >
                    {data
                      ? showAddresses
                        ? data.ip
                        : "•••.•••.•••.•••"
                      : connectionLoading
                        ? "Checking…"
                        : "Unavailable"}
                  </div>
                  {provider === "cloudflare" ? (
                    <dl className="exit-details">
                      <div>
                        <dt>Country / edge</dt>
                        <dd className="edge-value">
                          {data?.countryCode ?? "—"} / {data?.colo ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Transport</dt>
                        <dd className="tls-value">
                          {data?.tls ?? "—"}
                          <span className="warp-value">
                            WARP {data?.warp ?? "—"}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <dl className="exit-details">
                      <div>
                        <dt>Location</dt>
                        <dd className="network-location" title={location}>
                          {location || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Network</dt>
                        <dd>
                          <span className="network-asn">
                            {data?.asn ?? "—"}
                          </span>
                          <span
                            className="network-organization"
                            title={data?.organization}
                          >
                            {data?.organization ?? "—"}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        <div className="regions">
          {(["cn", "global"] as const).map((region) => (
            <section
              className="region-panel"
              data-region={region}
              key={region}
              aria-label={region === "cn" ? "China" : "International"}
            >
              <div className="region-heading">
                <h2>
                  {region === "cn" ? (
                    <span className="region-mark">CN</span>
                  ) : (
                    <Globe2 size={14} />
                  )}{" "}
                  {region === "cn" ? "China" : "International"}
                </h2>
                <span className="plot-legend">
                  <span className="legend-old" />
                  <span className="legend-new" />
                  log · {windowMinutes}m
                </span>
              </div>
              <div className="probe-grid">
                {TARGETS.filter((target) => target.region === region).map(
                  (target) => {
                    const h = history[target.id] ?? EMPTY;
                    const recent = selectRecentHistory(
                      h.samples,
                      now,
                      windowMinutes * 60000,
                    );
                    const stats = statistics(recent);
                    const last = h.samples.at(-1);
                    const value =
                      last && hasLatency(last) ? last.latency : null;
                    const state = !last
                      ? "Waiting"
                      : last.outcome === "ok"
                        ? "HTTP verified"
                        : last.outcome === "unverified"
                          ? "HTTP unverified"
                          : last.outcome === "timeout"
                            ? "Timeout"
                            : "Failed";
                    return (
                      <article
                        className="probe-card"
                        data-region={region}
                        key={target.id}
                      >
                        <div className="probe-heading">
                          <span
                            className={`service-avatar ${region}`}
                            aria-hidden="true"
                          >
                            {AVATARS[target.id]}
                          </span>
                          <div className="probe-title">
                            <h3 className="probe-name">
                              {target.name}
                              <span
                                className={`probe-status ${last?.outcome ?? "waiting"}`}
                                title={state}
                                aria-label={state}
                              >
                                {last?.outcome === "ok" ? (
                                  <CircleCheck size={12} />
                                ) : last?.outcome === "unverified" ? (
                                  <CircleHelp size={12} />
                                ) : (
                                  <span className="status-dot" />
                                )}
                                <span>
                                  {state === "Failed" || state === "Timeout"
                                    ? state
                                    : ""}
                                </span>
                              </span>
                            </h3>
                            <span className="probe-domain">
                              {new URL(target.url).hostname}
                            </span>
                          </div>
                          <div className="latest-reading">
                            <strong className="probe-latest">
                              {value === null ? (
                                "—"
                              ) : (
                                <NumberTicker value={Math.round(value)} />
                              )}
                            </strong>
                            <span>ms</span>
                          </div>
                        </div>
                        <ProbePlot
                          samples={recent}
                          now={now}
                          windowMs={windowMinutes * 60000}
                          scale={scale}
                          stats={stats}
                        />
                        <div className="probe-footer">
                          <div className="probe-stats">
                            <span>
                              P50 <b>{number(stats.median)}</b>
                            </span>
                            <span>
                              P95{" "}
                              <b title="Available after 40 valid readings">
                                {number(stats.p95)}
                              </b>
                            </span>
                            <span>
                              Jit <b>{number(stats.jitter)}</b>
                            </span>
                          </div>
                          <span
                            className={`probe-count ${stats.failed ? "has-failures" : ""}`}
                            title={`${stats.count} valid, ${stats.failed} failed in the selected window. ${h.total} total this session.`}
                          >
                            <span className="probe-window-count">
                              {stats.attempts} n
                            </span>
                            <span className="failure-count">
                              {stats.failed} fail
                            </span>
                          </span>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            </section>
          ))}
        </div>
      </main>
      <footer className="session-strip">
        <span className="session-clock">
          <span className="status-dot" />
          {elapsed}
        </span>
        <span>
          <b className="session-total">{total.toLocaleString("en-US")}</b>
          <span> checks</span>
        </span>
        <span className="retention-label">
          <b className="retained-total">{retained.toLocaleString("en-US")}</b> /{" "}
          {(TARGETS.length * HISTORY_LIMIT).toLocaleString("en-US")} retained
        </span>
        <span className="session-failures">
          <b>{failures}</b> failed
        </span>
        <a
          href="https://github.com/Leev1s/ping"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
        >
          <Github size={14} />
        </a>
      </footer>
      <dialog
        ref={menu}
        className="more-menu"
        aria-label="More options"
        onCancel={() => setMenuOpen(false)}
        onClose={() => setMenuOpen(false)}
        onClick={(e) => {
          if (e.target === menu.current) setMenuOpen(false);
        }}
      >
        <div className="menu-heading">
          <span>Options</span>
          <button
            className="control"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <label className="menu-setting">
          Sampling interval
          <select
            aria-label="Sampling interval"
            value={interval}
            onChange={(e) => {
              const n = Number(e.target.value);
              setIntervalSeconds(n);
              try {
                localStorage.setItem("ping-interval", String(n));
              } catch {
                /* preferences are optional */
              }
            }}
          >
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label="Plot scale"
          onClick={() => setScale((s) => (s === 1000 ? 5000 : 1000))}
        >
          <Globe2 size={17} />
          Plot scale
          <span className="menu-value">
            0–{scale.toLocaleString("en-US")} ms
          </span>
        </button>
        <button onClick={exportData}>
          <ArrowDownToLine size={17} />
          Export data
        </button>
        <button
          onClick={() => {
            setEpoch((e) => e + 1);
            setHistory({});
            setStartedAt(Date.now());
            setNotice("Started a new session");
            setMenuOpen(false);
          }}
        >
          <RotateCcw size={17} />
          Clear history
        </button>
        <button
          onClick={() => {
            setInfoVersion((v) => v + 1);
            setMenuOpen(false);
          }}
        >
          <RefreshCw size={17} />
          Refresh connection info
        </button>
        <a
          href="https://github.com/Leev1s/ping"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={17} />
          GitHub
        </a>
      </dialog>
      <div className={`notice ${notice ? "is-visible" : ""}`} role="status">
        {notice && (
          <>
            <Check size={14} />
            {notice}
          </>
        )}
      </div>
    </div>
  );
}
