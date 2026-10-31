import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchConnection, probe, type ProbeTarget } from "./network";

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

describe("fetchConnection", () => {
  it("parses Cloudflare trace fields and leaves missing values optional", async () => {
    const body = "ip=203.0.113.7\nloc=SG\ncolo=SIN\ntls=TLSv1.3\nwarp=off\n";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchConnection()).resolves.toEqual({
      ip: "203.0.113.7",
      country: "SG",
      colo: "SIN",
      tls: "TLSv1.3",
      warp: "off",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "one.one.one.one/cdn-cgi/trace",
    );
  });

  it("returns null when the trace endpoint cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(fetchConnection()).resolves.toBeNull();
  });

  it("times out after 4.5 seconds", async () => {
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

    const pending = fetchConnection();
    await vi.advanceTimersByTimeAsync(4_500);

    await expect(pending).resolves.toBeNull();
  });

  it("propagates external cancellation and removes its abort listener", async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
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

    const pending = fetchConnection(controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const [eventName, listener] = addListener.mock.calls[0];
    expect(eventName).toBe("abort");
    expect(removeListener).toHaveBeenCalledWith("abort", listener);
  });
});
