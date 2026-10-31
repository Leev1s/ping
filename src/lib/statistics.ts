import type { Sample } from "./network";

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
      values.length < 40 ? null : values[Math.ceil(0.95 * values.length) - 1],
    jitter: pairs ? changes / pairs : null,
  };
}
