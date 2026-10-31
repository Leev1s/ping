import { describe, expect, it } from "vitest";
import {
  appendSample,
  HISTORY_LIMIT,
  plotHistory,
  PLOT_POINT_LIMIT,
  selectRecentHistory,
} from "./history";
import type { Sample } from "./network";

function sample(at: number, latency: number | null = at % 100): Sample {
  return {
    at,
    latency,
    outcome: latency === null ? "timeout" : "unverified",
  };
}

describe("bounded probe history", () => {
  it("continues to accept samples after evicting the oldest attempt", () => {
    const initial = [sample(1), sample(2), sample(3)];
    const next = appendSample(initial, sample(4), 3);

    expect(next.map(({ at }) => at)).toEqual([2, 3, 4]);
    expect(initial.map(({ at }) => at)).toEqual([1, 2, 3]);
  });

  it("bounds eight probe streams after 100,000 total appends", () => {
    const histories: Sample[][] = Array.from({ length: 8 }, () => []);
    for (let at = 1; at <= 12_500; at += 1) {
      for (let probe = 0; probe < histories.length; probe += 1) {
        histories[probe] = appendSample(histories[probe], sample(at));
      }
    }

    expect(
      histories.reduce((count, history) => count + history.length, 0),
    ).toBe(8 * HISTORY_LIMIT);
    for (const history of histories) {
      expect(history).toHaveLength(HISTORY_LIMIT);
      expect(history[0].at).toBe(12_500 - HISTORY_LIMIT + 1);
      expect(history.at(-1)?.at).toBe(12_500);
    }
  });

  it("selects the actual trailing time range in chronological order", () => {
    const samples = [sample(90), sample(120), sample(100), sample(151)];

    expect(selectRecentHistory(samples, 150, 50).map(({ at }) => at)).toEqual([
      100, 120,
    ]);
  });

  it("retains failures in history and excludes future samples from the window", () => {
    const samples = [sample(90, null), sample(100, 20), sample(101, 20)];
    const recent = selectRecentHistory(samples, 100, 20);

    expect(recent.map(({ outcome }) => outcome)).toEqual([
      "timeout",
      "unverified",
    ]);
  });

  it("limits plot marks while keeping the window endpoints", () => {
    const samples = Array.from({ length: 1_000 }, (_, at) => sample(at + 1));
    const plotted = plotHistory(samples, 1_000, 1_000);

    expect(plotted).toHaveLength(PLOT_POINT_LIMIT);
    expect(plotted[0].sample.at).toBe(1);
    expect(plotted.at(-1)?.sample.at).toBe(1_000);
  });

  it("keeps latency extrema alongside stable-priority marks", () => {
    const samples = Array.from({ length: 1_000 }, (_, index) =>
      sample(index + 1, 25),
    );
    samples[455] = sample(456, 1);
    samples[700] = sample(701, 3_000);
    const plotted = plotHistory(samples, 1_000, 1_000);
    const latencies = plotted.map(({ sample: point }) => point.latency);

    expect(plotted).toHaveLength(PLOT_POINT_LIMIT);
    expect(latencies).toContain(1);
    expect(latencies).toContain(3_000);
    expect(plotted.at(-1)?.sample.at).toBe(1_000);
  });

  it("fades marks by elapsed age rather than their array position", () => {
    const plotted = plotHistory([sample(0), sample(25), sample(75)], 100, 100);

    expect(plotted[0].opacity).toBeCloseTo(0.16);
    expect(plotted[1].opacity).toBeCloseTo(0.37);
    expect(plotted[2].opacity).toBeCloseTo(0.79);
    expect(plotted[2].opacity).toBeGreaterThan(plotted[0].opacity);
  });
  it("keeps nearly all displayed samples when one measurement arrives above the point cap", () => {
    const samples = Array.from({ length: 1_000 }, (_, index) =>
      sample(index + 1, (index * 17) % 400),
    );
    const before = plotHistory(samples, 1_000, 2_000);
    const after = plotHistory([...samples, sample(1_001, 123)], 1_001, 2_000);
    const old = new Map(before.map((point) => [point.key, point.sample]));
    const retained = after.filter((point) => old.has(point.key));
    expect(retained.length).toBeGreaterThanOrEqual(PLOT_POINT_LIMIT - 4);
    for (const point of retained) expect(point.sample).toBe(old.get(point.key));
    expect(after.at(-1)?.sample.at).toBe(1_001);
  });

  it("keeps selection stable as points fade, and changes only a few marks when the window advances", () => {
    const samples = Array.from({ length: 1_000 }, (_, index) =>
      sample(index + 1),
    );
    const before = plotHistory(samples, 1_000, 1_000);
    const aged = plotHistory(samples, 1_000.5, 1_000);
    expect(aged.map((point) => point.key)).toEqual(
      before.map((point) => point.key),
    );
    const advanced = plotHistory(samples, 1_001.5, 1_000);
    const keys = new Set(before.map((point) => point.key));
    expect(
      advanced.filter((point) => keys.has(point.key)).length,
    ).toBeGreaterThanOrEqual(PLOT_POINT_LIMIT - 4);
  });

  it("gives coincident duplicate records one mark without changing raw history", () => {
    const samples = [sample(1, 10), sample(1, 10), sample(2, 20)];
    const marks = plotHistory(samples, 2, 10);
    expect(marks).toHaveLength(2);
    expect(new Set(marks.map((point) => point.key)).size).toBe(2);
    expect(samples).toHaveLength(3);
    expect(plotHistory(samples, 2, 10, 0.5)).toEqual([]);
  });
  it("keeps the recent tail visible before selecting older marks by priority", () => {
    const samples = Array.from({ length: 1_000 }, (_, index) =>
      sample(index + 1),
    );
    const marks = new Set(
      plotHistory(samples, 1_000, 2_000).map((point) => point.sample.at),
    );
    for (let at = 977; at <= 1_000; at++) expect(marks.has(at)).toBe(true);
  });
});
