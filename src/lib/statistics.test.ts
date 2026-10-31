import { describe, expect, it } from "vitest";
import { statistics, groupScale, createWindowStatistics } from "./statistics";
import type { Sample } from "./network";
const samples = (values: number[]): Sample[] =>
  values.map((latency, at) => ({ latency, at, outcome: "ok" }));
describe("box statistics", () => {
  it("uses interpolated quartiles and Tukey whiskers without discarding real tails", () => {
    const s = statistics(samples([1, 2, 3, 4, 5, 6, 7, 8, 100]));
    expect(s).toMatchObject({
      q1: 3,
      median: 5,
      q3: 7,
      low: 1,
      high: 8,
      min: 1,
      max: 100,
      count: 9,
    });
  });
  it("keeps unavailable statistics empty and handles a degenerate single sample", () => {
    expect(statistics([])).toMatchObject({
      median: null,
      q1: null,
      q3: null,
      low: null,
      high: null,
      jitter: null,
    });
    expect(statistics(samples([42]))).toMatchObject({
      median: 42,
      q1: 42,
      q3: 42,
      low: 42,
      high: 42,
      jitter: null,
    });
  });
  it("counts opaque timings but excludes errors and breaks jitter across failures", () => {
    const data: Sample[] = [
      { at: 1, latency: 10, outcome: "unverified" },
      { at: 2, latency: 30, outcome: "ok" },
      { at: 3, latency: 4000, outcome: "error" },
      { at: 4, latency: 80, outcome: "unverified" },
      { at: 5, latency: null, outcome: "timeout" },
    ];
    expect(statistics(data)).toMatchObject({
      median: 30,
      count: 3,
      failed: 2,
      attempts: 5,
      jitter: 20,
      max: 80,
    });
  });
  it("shows the empirical P95 from the first valid sample", () => {
    expect(statistics(samples([12])).p95).toBe(12);
    expect(statistics([]).p95).toBeNull();
    expect(
      statistics(samples(Array.from({ length: 39 }, (_, i) => i + 1))).p95,
    ).toBe(38);
    expect(
      statistics(samples(Array.from({ length: 40 }, (_, i) => i + 1))).p95,
    ).toBe(38);
  });
  it("excludes non-finite and negative observations", () => {
    expect(statistics(samples([NaN, Infinity, -1, 10]))).toMatchObject({
      count: 1,
      median: 10,
    });
  });
});

describe("shared regional scale", () => {
  it("rounds the highest valid P95 up to the nearest 100 ms", () => {
    expect(groupScale([null, null])).toBe(100);
    expect(groupScale([0, 10])).toBe(100);
    expect(groupScale([20, 80, 100, 160])).toBe(200);
    expect(groupScale([50, 500, 200, 100])).toBe(500);
    expect(groupScale([2500, 100])).toBe(2500);
    expect(groupScale([NaN, Infinity, -1])).toBe(100);
    expect(groupScale([500.1, 100])).toBe(600);
    expect(groupScale([99.9, 100])).toBe(100);
  });
});

describe("cached window statistics", () => {
  it("reuses summaries until data changes or the oldest record leaves the inclusive window", () => {
    const summarize = createWindowStatistics(100);
    const data = samples([10, 20]);
    const first = summarize(data, 50);
    expect(summarize(data, 100)).toBe(first);
    expect(summarize(data, 101).stats.count).toBe(1);
    expect(
      summarize([...data, { at: 101, latency: 30, outcome: "ok" }], 101).stats
        .count,
    ).toBe(2);
  });
  it("includes future records when time catches up and recalculates after a clock rollback", () => {
    const summarize = createWindowStatistics(100);
    const data: Sample[] = [
      { at: 50, latency: 10, outcome: "ok" },
      { at: 70, latency: 20, outcome: "ok" },
    ];
    const initial = summarize(data, 60);
    expect(summarize(data, 69)).toBe(initial);
    expect(summarize(data, 70).stats.count).toBe(2);
    expect(summarize(data, 40).stats.count).toBe(0);
    expect(summarize(data, 50).stats.count).toBe(1);
  });
});
