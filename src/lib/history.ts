import type { Sample } from "./network";
import { hasLatency } from "./statistics";

/** One count-based window for storage, statistics and drawing. */
export const HISTORY_LIMIT = 120;
const OPACITY_FLOOR = 0.12;
const FADE_HALF_LIFE_SAMPLES = 30;

/** Append in measurement order, evicting the oldest attempt at capacity. */
export function appendSample(
  samples: readonly Sample[],
  sample: Sample,
): Sample[] {
  return [...samples.slice(1 - HISTORY_LIMIT), sample];
}

export type PlotSample = { key: string; sample: Sample; opacity: number };

/** Rank-based fading needs no clock, sorting or display subsampling. */
export function plotHistory(samples: readonly Sample[]): PlotSample[] {
  const window = samples.slice(-HISTORY_LIMIT);
  const marks = new Map<string, PlotSample>();
  window.forEach((sample, index) => {
    if (!hasLatency(sample)) return;
    const age = window.length - 1 - index;
    const key = `${sample.at}:${sample.latency}:${sample.outcome}`;
    marks.delete(key);
    marks.set(key, {
      key,
      sample,
      opacity:
        OPACITY_FLOOR +
        (1 - OPACITY_FLOOR) * 2 ** (-age / FADE_HALF_LIFE_SAMPLES),
    });
  });
  return [...marks.values()];
}
