import { describe, expect, it } from "vitest";
import { statistics, groupRange } from "./statistics";
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

describe("shared regional range", () => {
  it("aligns both bounds to 50 ms, using the lowest sample and highest per-probe P95", () => {
    expect(groupRange([])).toEqual({ min: 0, max: 50 });
    expect(
      groupRange([
        { min: 162, p95: 348 },
        { min: 208, p95: 404 },
      ]),
    ).toEqual({ min: 150, max: 450 });
    expect(groupRange([{ min: 250, p95: 250 }])).toEqual({
      min: 250,
      max: 300,
    });
    expect(groupRange([{ min: 0, p95: 49.9 }])).toEqual({ min: 0, max: 50 });
    expect(groupRange([{ min: 50, p95: 500 }])).toEqual({ min: 50, max: 500 });
    expect(groupRange([{ min: 50, p95: 500.1 }])).toEqual({
      min: 50,
      max: 550,
    });
    expect(
      groupRange([
        { min: NaN, p95: Infinity },
        { min: null, p95: null },
        { min: -1, p95: -1 },
      ]),
    ).toEqual({ min: 0, max: 50 });
  });
});
