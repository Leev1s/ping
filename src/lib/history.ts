import type { Sample } from "./network";

/** Maximum raw attempts retained for each probe. At 5 s this covers 100 min. */
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
  return samples
    .map((sample, index) => ({ sample, index }))
    .filter(
      ({ sample }) =>
        Number.isFinite(sample.at) && sample.at >= start && sample.at <= now,
    )
    .sort(
      (left, right) =>
        left.sample.at - right.sample.at || left.index - right.index,
    )
    .map(({ sample }) => sample);
}

export type PlotSample = {
  sample: Sample;
  /** A stable 0.16–1 opacity derived from real age within the selected window. */
  opacity: number;
};

function plotIndexes(samples: readonly Sample[], limit: number): number[] {
  if (samples.length <= limit) {
    return samples.map((_, index) => index);
  }
  if (limit === 1) return [samples.length - 1];
  if (limit === 2) return [0, samples.length - 1];

  const required = new Set([0, samples.length - 1]);
  let minIndex = -1;
  let maxIndex = -1;
  let minLatency = Infinity;
  let maxLatency = -Infinity;

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
  if (required.size > limit) {
    return [...required].sort((a, b) => a - b).slice(-limit);
  }

  const selected = new Set(required);
  for (let index = 0; index < limit; index += 1) {
    selected.add(Math.round((index * (samples.length - 1)) / (limit - 1)));
  }

  // Keep the time spread while reserving slots for the endpoints and extrema.
  while (selected.size > limit) {
    const ordered = [...selected].sort((a, b) => a - b);
    let remove = -1;
    let smallestGap = Infinity;
    for (let index = 1; index < ordered.length - 1; index += 1) {
      const candidate = ordered[index];
      if (required.has(candidate)) continue;
      const gap = Math.min(
        candidate - ordered[index - 1],
        ordered[index + 1] - candidate,
      );
      if (gap < smallestGap) {
        smallestGap = gap;
        remove = candidate;
      }
    }
    if (remove === -1) break;
    selected.delete(remove);
  }

  return [...selected].sort((a, b) => a - b);
}

/**
 * Select a bounded, evenly spaced set of recent marks for a fixed-size plot.
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
  if (!Number.isFinite(maxPoints) || maxPoints <= 0) return [];

  const recent = selectRecentHistory(samples, now, windowMs);
  if (recent.length === 0) return [];

  const pointLimit = Math.floor(maxPoints);
  const selected = plotIndexes(recent, pointLimit).map(
    (index) => recent[index],
  );

  return selected.map((sample) => {
    const ageRatio = Math.min(1, Math.max(0, (now - sample.at) / windowMs));
    return {
      sample,
      opacity: 1 - ageRatio * 0.84,
    };
  });
}
