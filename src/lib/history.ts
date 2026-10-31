import type { Sample } from "./network";

/** Maximum raw attempts retained per probe. At the default 3 s this covers 60 min. */
export const HISTORY_LIMIT = 1_200;

/** Maximum number of measurement marks returned for one fixed-size plot. */
export const PLOT_POINT_LIMIT = 120;

/**
 * Append one completed attempt while keeping a fixed memory bound.
 *
 * Returns a new array for React state. The network sampler must continue
 * calling this after the cap is reached; old entries are evicted as new ones
 * arrive.
 */
export function appendSample(
  samples: readonly Sample[],
  sample: Sample,
  limit = HISTORY_LIMIT,
): Sample[] {
  const boundedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : 0;
  if (boundedLimit === 0) return [];

  if (samples.length < boundedLimit) return [...samples, sample];
  return [...samples.slice(samples.length - boundedLimit + 1), sample];
}

/** Return samples inside a fixed trailing time window, oldest first. */
export function selectRecentHistory(
  samples: readonly Sample[],
  now: number,
  windowMs: number,
): Sample[] {
  if (!Number.isFinite(now) || !Number.isFinite(windowMs) || windowMs <= 0) {
    return [];
  }

  const start = now - windowMs;
  const recent = samples.filter(
    (sample) =>
      Number.isFinite(sample.at) && sample.at >= start && sample.at <= now,
  );
  // Appends are normally chronological; avoid allocating wrapper objects and
  // sorting the whole stream again unless a clock adjustment changed its order.
  if (
    recent.some(
      (sample, index) => index > 0 && sample.at < recent[index - 1].at,
    )
  ) {
    recent.sort((left, right) => left.at - right.at);
  }
  return recent;
}

export type PlotSample = {
  /** Independent of selection order, so retained marks keep their DOM identity. */
  key: string;
  sample: Sample;
  /** A stable 0.16–1 opacity derived from real age within the selected window. */
  opacity: number;
};

function sampleKey(sample: Sample): string {
  return `${sample.at}:${sample.latency}:${sample.outcome}`;
}

// Deterministic FNV-1a priority: appending a sample never reranks existing ones.
function priority(sample: Sample): number {
  let hash = 2166136261;
  for (const character of sampleKey(sample)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function plotIndexes(samples: readonly Sample[], limit: number): number[] {
  if (samples.length <= limit) return samples.map((_, index) => index);
  if (limit === 1) return [samples.length - 1];
  if (limit === 2) return [0, samples.length - 1];

  const required = new Set([0, samples.length - 1]);
  // Keep arrivals visible for several rounds before they join older sampling.
  const recentCount = Math.min(24, Math.max(1, Math.floor(limit / 4)));
  for (
    let index = samples.length - recentCount;
    index < samples.length;
    index++
  )
    required.add(index);
  let minIndex = -1,
    maxIndex = -1,
    minLatency = Infinity,
    maxLatency = -Infinity;
  samples.forEach((sample, index) => {
    const latency = sample.latency;
    if (latency === null || !Number.isFinite(latency)) return;
    if (latency < minLatency) {
      minLatency = latency;
      minIndex = index;
    }
    if (latency > maxLatency) {
      maxLatency = latency;
      maxIndex = index;
    }
  });
  if (minIndex >= 0) required.add(minIndex);
  if (maxIndex >= 0) required.add(maxIndex);
  if (required.size > limit)
    return [...required].sort((a, b) => a - b).slice(-limit);

  const candidates = samples
    .map((sample, index) => ({ index, priority: priority(sample) }))
    .filter(({ index }) => !required.has(index))
    .sort(
      (a, b) =>
        a.priority - b.priority || samples[a.index].at - samples[b.index].at,
    );
  const selected = [
    ...required,
    ...candidates.slice(0, limit - required.size).map(({ index }) => index),
  ];
  return selected.sort((a, b) => a - b);
}

/**
 * Select bounded marks with stable priorities, preserving endpoints and extrema.
 *
 * Statistics should use `selectRecentHistory`; this function only limits the
 * drawing workload. Failed attempts remain in the result so the caller can
 * draw a distinct failure mark. Opacity follows elapsed time, not array index.
 */
export function plotHistory(
  samples: readonly Sample[],
  now: number,
  windowMs: number,
  maxPoints = PLOT_POINT_LIMIT,
): PlotSample[] {
  if (!Number.isFinite(maxPoints) || maxPoints < 1) return [];

  const seen = new Set<string>();
  // Coincident duplicate records still count in statistics, but need one mark.
  const recent = selectRecentHistory(samples, now, windowMs).filter(
    (sample) => {
      const key = sampleKey(sample);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  );
  if (recent.length === 0) return [];

  const pointLimit = Math.floor(maxPoints);
  const selected = plotIndexes(recent, pointLimit).map(
    (index) => recent[index],
  );

  return selected.map((sample) => {
    const ageRatio = Math.min(1, Math.max(0, (now - sample.at) / windowMs));
    return {
      key: sampleKey(sample),
      sample,
      opacity: 1 - ageRatio * 0.84,
    };
  });
}
