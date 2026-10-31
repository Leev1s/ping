import type { Sample } from "./network";
import { selectRecentHistory } from "./history";

export function hasLatency(
  sample: Sample,
): sample is Sample & { latency: number } {
  return (
    (sample.outcome === "ok" || sample.outcome === "unverified") &&
    sample.latency !== null &&
    Number.isFinite(sample.latency) &&
    sample.latency >= 0
  );
}

export function statistics(samples: readonly Sample[]) {
  const values = samples
    .filter(hasLatency)
    .map((sample) => sample.latency)
    .sort((a, b) => a - b);
  const quantile = (p: number) => {
    if (!values.length) return null;
    const at = (values.length - 1) * p,
      lower = Math.floor(at);
    return (
      values[lower] + (values[Math.ceil(at)] - values[lower]) * (at - lower)
    );
  };
  const q1 = quantile(0.25),
    median = quantile(0.5),
    q3 = quantile(0.75);
  const iqr = q1 === null || q3 === null ? 0 : q3 - q1;
  const inside =
    q1 === null || q3 === null
      ? []
      : values.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  let previous: number | null = null,
    changes = 0,
    pairs = 0;
  for (const sample of samples) {
    if (hasLatency(sample)) {
      if (previous !== null) {
        changes += Math.abs(sample.latency - previous);
        pairs++;
      }
      previous = sample.latency;
    } else previous = null;
  }
  return {
    count: values.length,
    attempts: samples.length,
    failed: samples.filter(
      (s) => s.outcome === "error" || s.outcome === "timeout",
    ).length,
    min: values[0] ?? null,
    max: values.at(-1) ?? null,
    q1,
    median,
    q3,
    low: inside[0] ?? null,
    high: inside.at(-1) ?? null,
    p95:
      values.length === 0 ? null : values[Math.ceil(0.95 * values.length) - 1],
    jitter: pairs ? changes / pairs : null,
  };
}

/** Region-wide linear range: smallest positive multiple of 100 covering every P95. */
export function groupScale(p95s: readonly (number | null)[]): number {
  const valid = p95s.filter(
    (n): n is number => n !== null && Number.isFinite(n) && n >= 0,
  );
  return Math.max(100, Math.ceil(Math.max(0, ...valid) / 100) * 100);
}

/** One bounded cache per probe; invalidate on new data or an exact window boundary. */
export function createWindowStatistics(windowMs: number) {
  let previous:
    | {
        samples: readonly Sample[];
        now: number;
        changesAt: number;
        recent: Sample[];
        stats: ReturnType<typeof statistics>;
      }
    | undefined;
  return (samples: readonly Sample[], now: number) => {
    if (
      previous &&
      previous.samples === samples &&
      now >= previous.now &&
      now < previous.changesAt
    )
      return previous;
    const recent = selectRecentHistory(samples, now, windowMs);
    let changesAt = recent.length ? recent[0].at + windowMs + 1 : Infinity;
    // Future records can become eligible after a system-clock adjustment.
    for (const sample of samples)
      if (sample.at > now) changesAt = Math.min(changesAt, sample.at);
    previous = { samples, now, changesAt, recent, stats: statistics(recent) };
    return previous;
  };
}
