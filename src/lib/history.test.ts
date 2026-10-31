import { describe, expect, it } from "vitest";
import { appendSample, HISTORY_LIMIT, plotHistory } from "./history";
import { statistics } from "./statistics";
import type { Sample } from "./network";

const sample = (at: number, latency: number | null = 25): Sample => ({
  at,
  latency,
  outcome: latency === null ? "timeout" : "unverified",
});

describe("120-attempt rolling history", () => {
  it("evicts old data while lifetime sampling can continue", () => {
    let history: Sample[] = [];
    for (let at = 1; at <= 100_000; at++)
      history = appendSample(history, sample(at));
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].at).toBe(100_000 - HISTORY_LIMIT + 1);
    expect(history.at(-1)?.at).toBe(100_000);
  });
  it("does not mutate the previous snapshot", () => {
    const previous = Array.from({ length: 120 }, (_, i) => sample(i));
    const next = appendSample(previous, sample(120));
    expect(next[0].at).toBe(1);
    expect(next.at(-1)?.at).toBe(120);
    expect(previous[0].at).toBe(0);
    expect(previous.at(-1)?.at).toBe(119);
  });
  it("excludes evicted outliers from every latency statistic", () => {
    let history: Sample[] = [];
    for (let at = 0; at < 120; at++)
      history = appendSample(history, sample(at, 3000));
    for (let at = 120; at < 240; at++)
      history = appendSample(history, sample(at, 25));
    expect(statistics(history)).toMatchObject({
      count: 120,
      attempts: 120,
      min: 25,
      max: 25,
      q1: 25,
      median: 25,
      q3: 25,
      p95: 25,
      jitter: 0,
    });
    expect(plotHistory(history)).toHaveLength(120);
  });
  it("counts failed attempts inside the window without fabricating points", () => {
    let history = Array.from({ length: 120 }, (_, i) => sample(i));
    for (let i = 120; i < 240; i++)
      history = appendSample(history, sample(i, null));
    expect(statistics(history)).toMatchObject({
      count: 0,
      attempts: 120,
      failed: 120,
      p95: null,
    });
    expect(plotHistory(history)).toEqual([]);
  });
  it("fades by sample age, not elapsed clock time or current sample count", () => {
    const history = Array.from({ length: 120 }, (_, i) => sample(i));
    const marks = plotHistory(history);
    expect(marks.at(-1)?.opacity).toBe(1);
    expect(marks[89].opacity).toBeCloseTo(0.56);
    expect(marks[59].opacity).toBeCloseTo(0.34);
    expect(marks[0].opacity).toBeCloseTo(0.176, 2);
    expect(plotHistory([sample(1), sample(2)])[0].opacity).toBeGreaterThan(
      0.97,
    );
  });
  it("keeps the other 119 point identities when a new reading evicts the oldest", () => {
    const history = Array.from({ length: 120 }, (_, i) => sample(i));
    const before = plotHistory(history);
    const after = plotHistory(appendSample(history, sample(120)));
    expect(after.slice(0, -1).map((p) => p.key)).toEqual(
      before.slice(1).map((p) => p.key),
    );
    for (let i = 0; i < 119; i++)
      expect(after[i].sample).toBe(before[i + 1].sample);
    expect(after[0].opacity).toBeLessThan(before[1].opacity);
  });
  it("uses arrival order through clock rollback and deduplicates coincident drawing only", () => {
    const history = [sample(100), sample(50), sample(100)];
    expect(statistics(history).count).toBe(3);
    const marks = plotHistory(history);
    expect(marks).toHaveLength(2);
    expect(marks.at(-1)?.opacity).toBe(1);
    expect(marks[0].sample.at).toBe(50);
    expect(marks.at(-1)?.sample.at).toBe(100);
  });
});
