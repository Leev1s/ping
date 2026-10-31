import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  Ellipsis,
  Eye,
  EyeOff,
  Globe2,
  Github,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { ThemePicker, isTheme, type Theme } from "./components/theme-picker";
import { MagicCard } from "./components/magicui/magic-card";
import { NumberTicker } from "./components/magicui/number-ticker";
import { TARGETS, probe, type Sample, type ProbeTarget } from "./lib/network";
import {
  fetchConnectionInfo,
  fetchLocationInfo,
  type LocationReport,
  type ConnectionReport,
} from "./lib/connection";
import {
  appendSample,
  HISTORY_LIMIT,
  plotHistory,
  selectRecentHistory,
} from "./lib/history";
import { hasLatency, statistics, groupScale } from "./lib/statistics";

const WINDOW_MINUTES = 30;
type ProbeHistory = { samples: Sample[]; total: number; failures: number };
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const EMPTY: ProbeHistory = { samples: [], total: 0, failures: 0 };
const number = (value: number | null) =>
  value === null ? "—" : Math.round(value).toLocaleString("en-US");

function ProbePlot({
  samples,
  now,
  stats,
  scale,
}: {
  scale: number;
  samples: Sample[];
  now: number;
  stats: ReturnType<typeof statistics>;
}) {
  const rippleClip = useId();
  const marks = plotHistory(
    samples.filter(hasLatency),
    now,
    WINDOW_MINUTES * 60000,
  );
  const latest = samples.at(-1);
  const newest = latest && hasLatency(latest) ? marks.at(-1) : undefined;
  const y = (sample: Sample) =>
    `${69 + ((Math.floor(sample.at) % 13) - 6) * 1.6}%`;
  const position = (value: number) =>
    3 + (Math.min(scale, Math.max(0, value)) / scale) * 94;
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
        <defs>
          <clipPath id={rippleClip}>
            <rect width="100%" height="100%" />
          </clipPath>
        </defs>
        <title>
          Box: Q1–Q3. Line: median. Whiskers: 1.5×IQR. Dots: measurements, older
          points fade. Linear axis, shared within this region.
        </title>
        {[0, scale / 2, scale].map((tick) => (
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
        {marks.map(({ key, sample, opacity }) => (
          <circle
            className={`sample-point ${sample.latency! > scale ? "is-overflow" : ""} ${key === newest?.key ? "is-latest" : ""}`}
            key={key}
            data-sample-key={key}
            cx={x(sample.latency!)}
            cy={y(sample)}
            r="2"
            opacity={opacity}
          >
            <title>
              {timeFormat.format(sample.at)} · {number(sample.latency)} ms
            </title>
          </circle>
        ))}
        {newest && (
          <g clipPath={`url(#${rippleClip})`} aria-hidden="true">
            <circle
              key={newest.key}
              className={`sample-ripple ${newest.sample.latency! > scale ? "is-overflow" : ""}`}
              data-sample-key={newest.key}
              cx={x(newest.sample.latency!)}
              cy={y(newest.sample)}
              r="2"
            />
          </g>
        )}
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
        aria-label={`Linear 0–${scale} millisecond scale`}
      >
        {[0, scale / 2, scale].map((tick, i) => (
          <span
            key={tick}
            style={{
              left: x(tick),
              transform:
                i === 0
                  ? "none"
                  : i === 2
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {tick >= 1000 ? `${tick / 1000}k` : tick}
            {i === 2 ? " ms" : ""}
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
      const n = Number(localStorage.getItem("ping-interval-seconds") ?? 3);
      return Number.isFinite(n) && n >= 1 && n <= 300 ? n : 3;
    } catch {
      return 3;
    }
  });
  const [intervalDraft, setIntervalDraft] = useState(String(interval));
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = document.documentElement.dataset.theme;
    return isTheme(saved) ? saved : "light";
  });
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [receivedAt, setReceivedAt] = useState(0);
  const [history, setHistory] = useState<Record<string, ProbeHistory>>({});
  const [now, setNow] = useState(Date.now);
  const [startedAt, setStartedAt] = useState(Date.now);
  const [connection, setConnection] = useState<ConnectionReport | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [infoVersion, setInfoVersion] = useState(0);
  const [showAddresses, setShowAddresses] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [epoch, setEpoch] = useState(0);
  const menu = useRef<HTMLDialogElement>(null);
  const warmed = useRef(new Set<string>());
  const [locations, setLocations] = useState<LocationReport>({});
  const activeSampling = useRef<AbortController | null>(null);
  const running = !paused && online;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("ping-theme", theme);
    } catch {
      /* preferences are optional */
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        getComputedStyle(document.documentElement)
          .getPropertyValue("--canvas")
          .trim(),
      );
  }, [theme]);
  useEffect(() => {
    const visibility = () => {
      setVisible(!document.hidden);
      if (!document.hidden) {
        activeSampling.current?.abort();
        setEpoch((value) => value + 1);
      }
    };
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
    activeSampling.current = controller;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const run = async (target: ProbeTarget) => {
      const started = performance.now();
      setPending((p) => ({ ...p, [target.id]: true }));
      try {
        const sample = await probe(target, controller.signal);
        if (controller.signal.aborted) return;
        setNow(sample.at);
        if (sample.latency !== null) setReceivedAt(sample.at);
        if (!warmed.current.has(target.id)) {
          warmed.current.add(target.id);
        } else
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
        setPending((p) => ({ ...p, [target.id]: false }));
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
      if (activeSampling.current === controller) activeSampling.current = null;
      setPending({});
      setReceivedAt(0);
    };
  }, [running, interval, epoch]);
  useEffect(() => {
    const controller = new AbortController();
    setConnectionLoading(true);
    setLocations({});
    fetchConnectionInfo(controller.signal)
      .then((report) => {
        if (!controller.signal.aborted) {
          setConnection(report);
          setConnectionLoading(false);
          void fetchLocationInfo(report, controller.signal)
            .then((result) => {
              if (!controller.signal.aborted) setLocations(result);
            })
            .catch(() => {});
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
  const summaries = Object.fromEntries(
    TARGETS.map((target) => {
      const h = history[target.id] ?? EMPTY;
      const recent = selectRecentHistory(
        h.samples,
        now,
        WINDOW_MINUTES * 60000,
      );
      return [target.id, { h, recent, stats: statistics(recent) }];
    }),
  );
  const scales = Object.fromEntries(
    (["cn", "global"] as const).map((region) => [
      region,
      groupScale(
        TARGETS.filter((target) => target.region === region).map(
          (target) => summaries[target.id].stats.p95,
        ),
      ),
    ]),
  ) as Record<"cn" | "global", number>;
  const total = Object.values(history).reduce((sum, h) => sum + h.total, 0);
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
        ? "Background"
        : "Live";
  const exportData = () => {
    const payload = {
      app: "Ping",
      version: 5,
      exportedAt: new Date().toISOString(),
      startedAt: new Date(startedAt).toISOString(),
      intervalSeconds: interval,
      windowMinutes: WINDOW_MINUTES,
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
          <span className="brand-symbol" aria-hidden="true" />
          <span className="brand-word">
            ping<span>.</span>
          </span>
        </a>
        <h1>Network status</h1>
        <div className="toolbar">
          <ThemePicker value={theme} onChange={setTheme} />
          <button
            className="control"
            aria-label="More options"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => {
              setIntervalDraft(String(interval));
              setMenuOpen(true);
            }}
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
            {(["china", "international"] as const).map((region) => {
              const data = connection?.[region];
              const Card = region === "china" ? MagicCard : "article";
              return (
                <Card
                  className="connection-card"
                  data-provider={region}
                  key={region}
                >
                  <div className="exit-heading">
                    <h3>
                      {region === "china" ? "China exit" : "International exit"}
                    </h3>
                    <span className="exit-source">
                      {region === "china" ? "Tencent DNSPod" : "ICanHazIP"}
                    </span>
                  </div>
                  <div className="address-rows">
                    {(["ipv4", "ipv6"] as const).map((family) => {
                      const lookup = data?.[family];
                      const address =
                        lookup?.status === "ok" ? lookup.ip : undefined;
                      const label = connectionLoading
                        ? "Checking…"
                        : lookup?.status === "unsupported"
                          ? "Not supported"
                          : "Unavailable";
                      return (
                        <div className="address-row" key={family}>
                          <span className="address-label">
                            {family === "ipv4" ? "IPv4" : "IPv6"}
                          </span>
                          <button
                            className={`exit-address copy-address ${!address ? "is-unavailable" : ""}`}
                            disabled={!address || !showAddresses}
                            aria-label={
                              address && showAddresses
                                ? `Copy full ${family === "ipv4" ? "IPv4" : "IPv6"} address from ${region === "china" ? "China" : "International"} exit`
                                : undefined
                            }
                            title={
                              address && showAddresses
                                ? `${address} · Click to copy`
                                : !address
                                  ? "Network failures are unavailable; they do not prove that your network lacks IPv6."
                                  : undefined
                            }
                            onClick={async () => {
                              if (!address) return;
                              try {
                                await navigator.clipboard.writeText(address);
                                setNotice(
                                  `${family === "ipv4" ? "IPv4" : "IPv6"} address copied`,
                                );
                              } catch {
                                setNotice("Clipboard unavailable");
                              }
                            }}
                          >
                            {address
                              ? showAddresses
                                ? address
                                : "••••••••"
                              : label}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="exit-geography"
                    aria-label={`${region === "china" ? "China" : "International"} exit location`}
                  >
                    {(["location", "network", "timezone"] as const).map(
                      (field) => {
                        const geo = locations[region];
                        const text = !showAddresses
                          ? "Hidden"
                          : geo?.status === "ok"
                            ? geo[field] || "Unavailable"
                            : geo?.status === "unavailable"
                              ? "Unavailable"
                              : "Checking…";
                        return (
                          <div className={`geo-row geo-${field}`} key={field}>
                            <span className="geo-label">
                              {field === "location"
                                ? "Location"
                                : field === "network"
                                  ? "Network"
                                  : "Time zone"}
                            </span>
                            <span title={showAddresses ? text : undefined}>
                              {text}
                            </span>
                          </div>
                        );
                      },
                    )}
                    <span className="geo-source">
                      {locations[region]?.family
                        ? locations[region]?.family === "ipv6"
                          ? "IPv6"
                          : "IPv4"
                        : "Location"}{" "}
                      ·{" "}
                      <a
                        href="https://ipinfo.io"
                        target="_blank"
                        rel="noreferrer"
                      >
                        IPinfo
                      </a>
                    </span>
                  </div>
                </Card>
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
                  last {WINDOW_MINUTES}m
                </span>
              </div>
              <div className="probe-grid">
                {TARGETS.filter((target) => target.region === region).map(
                  (target) => {
                    const { h, recent, stats } = summaries[target.id];
                    const last = h.samples.at(-1);
                    const value =
                      last && hasLatency(last) ? last.latency : null;
                    const failed =
                      last?.outcome === "error" || last?.outcome === "timeout";
                    const state = !last
                      ? warmed.current.has(target.id)
                        ? "Waiting"
                        : "Warm-up"
                      : last.outcome === "ok"
                        ? "HTTP verified"
                        : last.outcome === "unverified"
                          ? "HTTP unverified"
                          : last.outcome === "timeout"
                            ? "Timeout"
                            : "Failed";
                    return (
                      <article
                        className={`probe-card ${failed ? "is-unreachable" : ""}`}
                        data-region={region}
                        key={target.id}
                      >
                        <div className="probe-heading">
                          <div className="probe-title">
                            <h3 className="probe-name">
                              <span
                                key={`${last?.at ?? 0}-${pending[target.id]}`}
                                className={`latency-dot ${pending[target.id] ? "is-probing" : ""} ${last ? "has-reading" : ""}`}
                                style={{
                                  background: failed
                                    ? "var(--danger)"
                                    : value === null
                                      ? "var(--muted)"
                                      : `color-mix(in oklch, ${value < 250 ? "var(--latency-good)" : "var(--latency-mid)"}, ${value < 250 ? "var(--latency-mid)" : "var(--latency-bad)"} ${Math.min(100, ((value < 250 ? value : value - 250) / 250) * 100)}%)`,
                                }}
                                title={
                                  pending[target.id]
                                    ? `Measuring · ${state}`
                                    : state
                                }
                                role="img"
                                aria-label={state}
                              />
                              {target.name}
                            </h3>
                            <span className="probe-domain">
                              {new URL(target.url).hostname}
                            </span>
                          </div>
                          <div className="latest-reading">
                            <strong className="probe-latest">
                              {value === null ? (
                                <span className="reading-state">
                                  {failed
                                    ? last?.outcome === "timeout"
                                      ? "Timeout"
                                      : last?.latency !== null
                                        ? "HTTP error"
                                        : "No reply"
                                    : state}
                                </span>
                              ) : (
                                <NumberTicker value={Math.round(value)} />
                              )}
                            </strong>
                            <span>{value === null ? "" : "ms"}</span>
                          </div>
                        </div>
                        <ProbePlot
                          samples={recent}
                          now={now}
                          stats={stats}
                          scale={scales[region]}
                        />
                        <div className="probe-footer">
                          <div className="probe-stats">
                            <span>
                              P50 <b>{number(stats.median)}</b>
                            </span>
                            <span>
                              P95{" "}
                              <b
                                className="p95-value"
                                title={
                                  stats.count < 40
                                    ? `Early estimate from ${stats.count} valid readings`
                                    : `P95 from ${stats.count} valid readings`
                                }
                              >
                                {stats.p95 !== null && stats.count < 40
                                  ? "~"
                                  : ""}
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
          <span> measurements</span>
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
        <button
          className={`live-control ${running ? "is-live" : ""}`}
          aria-label={paused ? "Resume" : "Pause"}
          title={`${stateText} · ${interval}s · ${paused ? "Resume" : "Pause"} sampling${!visible ? " · Background timing is best effort" : ""}`}
          onClick={() => setPaused(!paused)}
        >
          <svg
            className={`activity-chart ${Object.values(pending).some(Boolean) ? "is-sending" : ""}`}
            width="22"
            height="22"
            viewBox="0 0 22 22"
            aria-hidden="true"
          >
            <path
              d="M2 6h17m-4-3 4 3-4 3M20 16H3m4-3-4 3 4 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            {running && visible && (
              <circle
                className="tx-packet"
                cx="3"
                cy="6"
                r="2"
                fill="currentColor"
              />
            )}
            {running && visible && receivedAt > 0 && (
              <circle
                key={receivedAt}
                className="rx-packet"
                cx="19"
                cy="16"
                r="2"
                fill="currentColor"
              />
            )}
          </svg>
          <span className="status-badge">{stateText}</span>
          <span className="cadence">{Number(interval.toFixed(2))}s</span>
        </button>
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
        <form
          className="interval-form"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(intervalDraft);
            if (!Number.isFinite(n) || n < 1 || n > 300) return;
            setIntervalSeconds(n);
            try {
              localStorage.setItem("ping-interval-seconds", String(n));
            } catch {
              /* preferences are optional */
            }
            setNotice(`Sampling every ${n}s`);
            setMenuOpen(false);
          }}
        >
          <label className="menu-setting">
            Interval <span className="input-unit">seconds</span>
            <input
              aria-label="Sampling interval"
              type="number"
              min="1"
              max="300"
              step="any"
              required
              value={intervalDraft}
              onChange={(e) => setIntervalDraft(e.target.value)}
            />
          </label>
          <button type="submit" className="apply-interval">
            Apply interval
          </button>
        </form>
        <button onClick={exportData}>
          <ArrowDownToLine size={17} />
          Export data
        </button>
        <button
          onClick={() => {
            setEpoch((e) => e + 1);
            activeSampling.current?.abort();
            warmed.current.clear();
            setHistory({});
            setStartedAt(Date.now());
            setNotice("Started a new session");
            setMenuOpen(false);
          }}
        >
          <RotateCcw size={17} />
          Clear history
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
