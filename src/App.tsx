import { useEffect, useRef, useState } from "react";
import {
  Activity,
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
import { copy, preference, savePreference, type Lang } from "./lib/i18n";
import {
  TARGETS,
  probe,
  fetchConnection,
  type Sample,
  type ProbeTarget,
} from "./lib/network";
import { distribution } from "./lib/distribution";

type History = Record<string, Sample[]>;
const BIN_LABELS = ["<50", "50–100", "100–250", "250–500", "500–1k", "≥1k"];

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
    const n = Number(preference("ping-interval", "5"));
    return [3, 5, 10].includes(n) ? n : 5;
  });
  const [history, setHistory] = useState<History>({});
  const [selected, setSelected] = useState("cloudflare");
  const [connection, setConnection] =
    useState<Awaited<ReturnType<typeof fetchConnection>>>(null);
  const [infoState, setInfoState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [infoVersion, setInfoVersion] = useState(0);
  const [showIP, setShowIP] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [epoch, setEpoch] = useState(0);
  const menu = useRef<HTMLDialogElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
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
    const run = async (target: ProbeTarget) => {
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
    const timer = setTimeout(() => setNotice(""), 2200);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (menuOpen) menu.current?.showModal();
    else menu.current?.close();
  }, [menuOpen]);
  const closeMenu = () => {
    setMenuOpen(false);
    moreButton.current?.focus();
  };
  const nameOf = (target: ProbeTarget) =>
    target.region === "cn"
      ? t[target.id as "baidu" | "bilibili" | "wechat" | "taobao"]
      : target.name;
  const selectedTarget = TARGETS.find((target) => target.id === selected)!;
  const samples = history[selected] ?? [];
  const stats = distribution(samples);
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
      version: 2,
      exportedAt: new Date().toISOString(),
      measurement:
        "Browser HTTP time to response headers; not ICMP. Opaque responses do not verify HTTP status.",
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
    setNotice(t.exported);
    closeMenu();
  };
  const metric = (value: number | null) =>
    value === null ? "—" : <NumberTicker value={Math.round(value)} />;
  const metrics = [
    { label: "P50", value: stats.p50, title: t.median },
    { label: "P95", value: stats.p95, title: t.sampleGate },
    { label: t.jitter, value: stats.jitter, title: t.jitter },
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="identity">
          <a className="brand" href="/" aria-label="Ping">
            <Activity aria-hidden="true" size={22} />
            <span>
              ping<span className="brand-period">.</span>
            </span>
          </a>
          <h1>{t.network}</h1>
        </div>
        <div className="toolbar">
          <span className={`status-badge ${running ? "is-live" : ""}`}>
            <span className="status-dot" />
            {stateText}
          </span>
          <label className="interval-control">
            <select
              aria-label={t.interval}
              value={interval}
              onChange={(e) => {
                const n = Number(e.target.value);
                setIntervalSeconds(n);
                savePreference("ping-interval", String(n));
              }}
            >
              {[3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} {t.seconds}
                </option>
              ))}
            </select>
          </label>
          <button
            className="control pause-button"
            aria-label={paused ? t.resume : t.pause}
            title={paused ? t.resume : t.pause}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            className="control language-button"
            aria-label={t.language}
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          >
            <span className={lang === "zh" ? "language-active" : ""}>中</span>
            <span className="language-divider">/</span>
            <span className={lang === "en" ? "language-active" : ""}>EN</span>
          </button>
          <button
            ref={moreButton}
            className="control"
            aria-label={t.more}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Ellipsis size={20} />
          </button>
        </div>
      </header>
      <main>
        <section className="summary" aria-label={t.distribution}>
          <div className="summary-heading">
            <h2 className="summary-target">
              {nameOf(selectedTarget)}
              <span>HTTP · ms</span>
            </h2>
            <span className="sample-count">
              <span className="mono">{stats.valid}</span> / 60{" "}
              <span>{t.samples}</span>
            </span>
          </div>
          <div className="summary-content">
            <div className="metrics">
              {metrics.map((item) => (
                <div className="metric" key={item.label} title={item.title}>
                  <span className="metric-label">{item.label}</span>
                  <strong className="metric-value">{metric(item.value)}</strong>
                </div>
              ))}
              <div className="metric">
                <span className="metric-label">{t.failures}</span>
                <strong className="metric-value failed-value">
                  <span className={stats.failed ? "has-failures" : ""}>
                    {stats.failed}
                  </span>
                  <span className="metric-denominator">/{samples.length}</span>
                </strong>
              </div>
            </div>
            <div className="distribution">
              <div className="distribution-heading">
                <span>{t.distribution}</span>
                <span>0–100%</span>
              </div>
              <div
                className="histogram"
                role="img"
                aria-label={`${t.distribution}: ${stats.bins.map((n, i) => `${BIN_LABELS[i]} ms: ${n}`).join(", ")}`}
              >
                {stats.bins.map((count, i) => (
                  <div className="histogram-bin" key={i}>
                    <div className="bin-track">
                      <div
                        className="bin-fill"
                        style={{
                          height: `${stats.valid ? (count / stats.valid) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="bin-label">{BIN_LABELS[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <div className="regions">
          {(["cn", "global"] as const).map((region) => (
            <section
              className="region-panel"
              key={region}
              data-region={region}
              aria-label={t[region]}
            >
              <div className="region-heading">
                <h2>
                  {region === "cn" ? (
                    <span className="region-mark">CN</span>
                  ) : (
                    <Globe2 size={15} />
                  )}{" "}
                  {t[region]}
                </h2>
                <span className="region-count">04</span>
              </div>
              <div className="probe-grid">
                {TARGETS.filter((target) => target.region === region).map(
                  (target) => {
                    const attempts = history[target.id] ?? [];
                    const last = attempts.at(-1);
                    const ds = distribution(attempts);
                    const state = !last
                      ? "waiting"
                      : last.outcome === "ok"
                        ? "healthy"
                        : last.outcome === "unverified"
                          ? "unverified"
                          : last.outcome === "timeout"
                            ? "timeout"
                            : "error";
                    const lastValue =
                      last &&
                      (last.outcome === "ok" || last.outcome === "unverified")
                        ? last.latency
                        : null;
                    return (
                      <button
                        className={`probe-card ${selected === target.id ? "is-selected" : ""}`}
                        key={target.id}
                        aria-pressed={selected === target.id}
                        onClick={() => setSelected(target.id)}
                        aria-label={`${nameOf(target)}, ${t[state]}, ${lastValue === null ? "—" : Math.round(lastValue)} ms`}
                        title={`${new URL(target.url).hostname} · ${t[state]}`}
                      >
                        <div className="probe-heading">
                          <span className="probe-name">{nameOf(target)}</span>
                          <span
                            className={`probe-status status-${state}`}
                            aria-label={t[state]}
                          >
                            {state === "healthy" ? (
                              <CircleCheck size={13} />
                            ) : state === "unverified" ? (
                              <CircleHelp size={13} />
                            ) : (
                              <span className="status-dot" />
                            )}
                            <span>{t[state]}</span>
                          </span>
                        </div>
                        <div className="probe-reading">
                          <strong className="probe-value">
                            {metric(lastValue)}
                          </strong>
                          <span className="probe-unit">ms</span>
                          <span className="probe-median">
                            P50{" "}
                            <span>
                              {ds.p50 === null ? "—" : Math.round(ds.p50)}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </section>
          ))}
        </div>
      </main>
      <footer className="connection-strip">
        <div className="connection-ip">
          <span className="connection-label">IP</span>
          <span
            className="ip-value"
            title={showIP ? connection?.ip : undefined}
          >
            {connection?.ip
              ? showIP
                ? connection.ip
                : "•••.•••.•••.•••"
              : "—"}
          </span>
          <button
            className="control ip-control"
            aria-label={showIP ? t.conceal : t.reveal}
            onClick={() => setShowIP(!showIP)}
          >
            {showIP ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <span
          className="edge-value"
          title={`${t.edge}: ${connection?.colo ?? t.unavailable}`}
        >
          {connection?.country ?? "—"}
          <span className="edge-divider">/</span>
          {connection?.colo ?? "—"}
        </span>
        <span className="window-count" title={t.window}>
          <span className="mono">{total}</span> / 480
        </span>
        <span
          className={`connection-state ${infoState}`}
          aria-label={infoState === "error" ? t.unavailable : undefined}
        >
          {infoState === "loading" ? (
            <RefreshCw size={12} />
          ) : (
            <span className="status-dot" />
          )}
        </span>
      </footer>
      <dialog
        ref={menu}
        className="more-menu"
        aria-label={t.more}
        onCancel={() => setMenuOpen(false)}
        onClick={(e) => {
          if (e.target === menu.current) closeMenu();
        }}
        onClose={() => setMenuOpen(false)}
      >
        <div className="menu-heading">
          <span>{t.more}</span>
          <button className="control" aria-label={t.close} onClick={closeMenu}>
            <X size={18} />
          </button>
        </div>
        <button onClick={exportData}>
          <ArrowDownToLine size={17} />
          {t.export}
        </button>
        <button
          onClick={() => {
            setEpoch((e) => e + 1);
            setHistory({});
            setNotice(t.cleared);
            closeMenu();
          }}
        >
          <RotateCcw size={17} />
          {t.reset}
        </button>
        <button
          onClick={() => {
            setInfoVersion((v) => v + 1);
            closeMenu();
          }}
        >
          <RefreshCw size={17} />
          {t.refresh}
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
