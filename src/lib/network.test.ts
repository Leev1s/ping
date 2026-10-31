import { afterEach, describe, expect, it, vi } from "vitest";
import { probe, type ProbeTarget } from "./network";

const corsTarget: ProbeTarget = {
  id: "test",
  name: "Test",
  url: "https://probe.example.test/check?existing=1",
  region: "global",
  method: "cors",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probe", () => {
  it("uses a unique no-store CORS request and accepts an HTTP success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await probe(corsTarget);
    const [requestUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(result.outcome).toBe("ok");
    expect(result.latency).toEqual(expect.any(Number));
    expect(new URL(requestUrl).searchParams.get("existing")).toBe("1");
    expect(new URL(requestUrl).searchParams.get("_ping")).toBeTruthy();
    expect(init).toMatchObject({
      cache: "no-store",
      mode: "cors",
      credentials: "omit",
    });
  });

  it("records a visible HTTP failure as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    const result = await probe(corsTarget);

    expect(result).toMatchObject({ outcome: "error" });
    expect(result.latency).toEqual(expect.any(Number));
  });

  it("measures opaque requests without claiming that they succeeded", async () => {
    const opaqueTarget = { ...corsTarget, method: "opaque" as const };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    const result = await probe(opaqueTarget);

    expect(result.outcome).toBe("unverified");
    expect(result.latency).toEqual(expect.any(Number));
    expect(result.verification).toBe("opaque");
  });

  it("tags failed opaque requests so they do not become confirmed outages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(
      probe({ ...corsTarget, method: "opaque" }),
    ).resolves.toMatchObject({
      outcome: "error",
      verification: "opaque",
      latency: null,
    });
  });

  it("returns timeout after 4.5 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );

    const pending = probe(corsTarget);
    await vi.advanceTimersByTimeAsync(4_500);

    await expect(pending).resolves.toMatchObject({
      outcome: "timeout",
      latency: null,
    });
  });

  it("rejects a stale response even when the browser delayed its timeout callback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const pending = probe(corsTarget);
    // Advance wall time without executing timers, as during a suspended page.
    vi.setSystemTime(60_000);
    finish(new Response(null, { status: 200 }));
    await expect(pending).resolves.toMatchObject({
      outcome: "timeout",
      latency: null,
    });
  });

  it("propagates caller cancellation instead of counting it as an outage", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = probe(corsTarget, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not start a request when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(probe(corsTarget, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
