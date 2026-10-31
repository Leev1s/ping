import type { Sample } from "./network";

/** Fixed left-closed latency intervals in milliseconds; the last has no ceiling. */
export const LATENCY_BUCKET_EDGES = [0, 50, 100, 250, 500, 1_000] as const;

export type LatencyDistribution = {
  /** Counts for [0,50), [50,100), [100,250), [250,500), [500,1000), [1000,∞). */
  bins: number[];
  valid: number;
  /** HTTP errors and timeouts; not a packet-loss estimate. */
  failed: number;
  p50: number | null;
  /** Nearest-rank P95, shown only when at least 40 valid observations exist. */
  p95: number | null;
  /** Mean absolute latency delta for adjacent valid observations. */
  jitter: number | null;
};

const VALID_OUTCOMES = new Set(["ok", "unverified"]);

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Summarize a single target's rolling browser-HTTP samples in fixed bins. */
export function distribution(samples: Sample[]): LatencyDistribution {
  const chronological = [...samples].sort((a, b) => a.at - b.at);
  const validSamples = chronological.filter(
    (sample) =>
      VALID_OUTCOMES.has(sample.outcome) &&
      sample.latency !== null &&
      Number.isFinite(sample.latency) &&
      sample.latency >= 0,
  );
  const values = validSamples.map((sample) => sample.latency as number);
  const sorted = [...values].sort((a, b) => a - b);
  const bins = Array.from({ length: LATENCY_BUCKET_EDGES.length }, () => 0);

  for (const latency of values) {
    const bucket = LATENCY_BUCKET_EDGES.findIndex((edge) => latency < edge);
    bins[bucket === -1 ? bins.length - 1 : bucket - 1] += 1;
  }

  let previous: number | null = null;
  let deltaTotal = 0;
  let adjacentPairs = 0;
  let failed = 0;

  for (const sample of chronological) {
    if (sample.outcome === "error" || sample.outcome === "timeout") {
      failed += 1;
    }

    if (
      VALID_OUTCOMES.has(sample.outcome) &&
      sample.latency !== null &&
      Number.isFinite(sample.latency) &&
      sample.latency >= 0
    ) {
      if (previous !== null) {
        deltaTotal += Math.abs(sample.latency - previous);
        adjacentPairs += 1;
      }
      previous = sample.latency;
    } else {
      // Do not measure variation across a failed or malformed observation.
      previous = null;
    }
  }

  const p50 = median(sorted);
  const p95 =
    sorted.length < 40 ? null : sorted[Math.ceil(sorted.length * 0.95) - 1];

  return {
    bins,
    valid: sorted.length,
    failed,
    p50: p50 === null ? null : roundOneDecimal(p50),
    p95: p95 === null ? null : roundOneDecimal(p95),
    jitter:
      adjacentPairs === 0 ? null : roundOneDecimal(deltaTotal / adjacentPairs),
  };
}
