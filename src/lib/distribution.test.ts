import { describe, expect, it } from "vitest";
import { distribution } from "./distribution";
import type { Sample } from "./network";

function sample(
  at: number,
  latency: number | null,
  outcome: Sample["outcome"] = "ok",
): Sample {
  return { at, latency, outcome };
}

describe("distribution", () => {
  it("uses six fixed left-closed bins and preserves overflow in the last bin", () => {
    const values = [
      0, 49.9, 50, 99.9, 100, 249.9, 250, 499.9, 500, 999.9, 1_000, 8_000,
    ];
    const result = distribution(
      values.map((latency, index) => sample(index, latency)),
    );

    expect(result.bins).toEqual([2, 2, 2, 2, 2, 2]);
    expect(result.bins).toHaveLength(6);
    expect(result.bins.reduce((total, count) => total + count, 0)).toBe(
      result.valid,
    );
    expect(result.valid).toBe(12);
  });

  it("returns a median and nearest-rank P95 only at 40 valid observations", () => {
    const first39 = Array.from({ length: 39 }, (_, at) => sample(at, at + 1));
    expect(distribution(first39)).toMatchObject({
      valid: 39,
      p50: 20,
      p95: null,
    });

    const at40 = [...first39, sample(39, 100)];
    expect(distribution(at40)).toMatchObject({ valid: 40, p50: 20.5, p95: 38 });
  });

  it("counts failures but excludes their latencies from bins and percentiles", () => {
    const result = distribution([
      sample(1, 10),
      sample(2, 500, "error"),
      sample(3, null, "timeout"),
      { at: 4, latency: 20, outcome: "unverified", verification: "opaque" },
    ]);

    expect(result).toEqual({
      bins: [2, 0, 0, 0, 0, 0],
      valid: 2,
      failed: 2,
      p50: 15,
      p95: null,
      jitter: null,
    });
  });

  it("breaks jitter pairs across failures and sorts samples chronologically", () => {
    const result = distribution([
      sample(6, 35),
      sample(4, 500, "error"),
      sample(5, 70),
      sample(3, 10),
      sample(2, null, "timeout"),
      sample(1, 90),
    ]);

    // Every failure resets the adjacent-sample run; only [70, 35] is a pair.
    expect(result.jitter).toBe(35);
    expect(result.valid).toBe(4);
    expect(result.failed).toBe(2);
  });

  it("does not place negative, infinite, or NaN timings in any bucket", () => {
    const result = distribution([
      sample(1, -1),
      sample(2, Number.POSITIVE_INFINITY),
      sample(3, Number.NaN),
      sample(4, 25),
    ]);

    expect(result).toEqual({
      bins: [1, 0, 0, 0, 0, 0],
      valid: 1,
      failed: 0,
      p50: 25,
      p95: null,
      jitter: null,
    });
  });

  it("calculates fixed-window counts from the samples the caller supplies", () => {
    const rollingWindow = Array.from({ length: 60 }, (_, at) =>
      sample(at, 200),
    );
    const result = distribution(rollingWindow);

    expect(result.bins).toEqual([0, 0, 60, 0, 0, 0]);
    expect(result.valid).toBe(60);
    expect(result.p50).toBe(200);
    expect(result.p95).toBe(200);
  });
});
