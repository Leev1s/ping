import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchConnectionInfo } from "./connection";

const urls = {
  china4: "https://ipv4.ddnspod.com/checkip",
  china6: "https://ipv6.ddnspod.com/checkip",
  overseas4: "https://ipv4.icanhazip.com/",
  overseas6: "https://ipv6.icanhazip.com/",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchConnectionInfo", () => {
  it("reads each region and address family from its own public endpoint", async () => {
    const bodies: Record<string, string> = {
      [urls.china4]: "203.0.113.8\n",
      [urls.china6]: "2001:db8::8\n",
      [urls.overseas4]: "198.51.100.8\n",
      [urls.overseas6]: "2001:db8::9\n",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const body = bodies[String(input)];
        if (!body) throw new Error(`Unexpected request: ${String(input)}`);
        return new Response(body, { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchConnectionInfo()).resolves.toEqual({
      china: {
        provider: "dnspod",
        ipv4: { status: "ok", ip: "203.0.113.8" },
        ipv6: { status: "ok", ip: "2001:db8::8" },
      },
      international: {
        provider: "icanhazip",
        ipv4: { status: "ok", ip: "198.51.100.8" },
        ipv6: { status: "ok", ip: "2001:db8::9" },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining(Object.values(urls)),
    );
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.cache === "no-store"),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.mode === "cors"),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.credentials === "omit"),
    ).toBe(true);
  });

  it("keeps family-specific failures separate and preserves successful results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        switch (String(input)) {
          case urls.china4:
            return new Response("192.0.2.4", { status: 200 });
          case urls.china6:
            return new Response("not-an-ip", { status: 200 });
          case urls.overseas4:
            return new Response("unavailable", { status: 503 });
          case urls.overseas6:
            throw new TypeError("Network request failed");
          default:
            throw new Error(`Unexpected request: ${String(input)}`);
        }
      }),
    );

    await expect(fetchConnectionInfo()).resolves.toEqual({
      china: {
        provider: "dnspod",
        ipv4: { status: "ok", ip: "192.0.2.4" },
        ipv6: { status: "unavailable", reason: "invalid" },
      },
      international: {
        provider: "icanhazip",
        ipv4: { status: "unavailable", reason: "http" },
        ipv6: { status: "unavailable", reason: "network" },
      },
    });
  });

  it("marks an endpoint unsupported only when it explicitly returns 501", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === urls.china6) {
          return new Response("Not implemented", { status: 501 });
        }
        return new Response("203.0.113.5", { status: 200 });
      }),
    );

    const result = await fetchConnectionInfo();
    expect(result.china.ipv6).toEqual({ status: "unsupported" });
    expect(result.china.ipv4).toEqual({ status: "ok", ip: "203.0.113.5" });
  });

  it("treats a missing endpoint as HTTP failure and validates IPv6 literals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        switch (String(input)) {
          case urls.china4:
          case urls.overseas4:
            return new Response("203.0.113.5", { status: 200 });
          case urls.china6:
            return new Response(":1:2:3:4:5:6:7:8", { status: 200 });
          case urls.overseas6:
            return new Response("::ffff:192.0.2.8", { status: 200 });
          default:
            throw new Error(`Unexpected request: ${String(input)}`);
        }
      }),
    );

    const result = await fetchConnectionInfo();
    expect(result.china.ipv6).toEqual({
      status: "unavailable",
      reason: "invalid",
    });
    expect(result.international.ipv6).toEqual({
      status: "ok",
      ip: "::ffff:192.0.2.8",
    });
  });

  it("does not confuse a missing route with a provider unsupported response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === urls.china6) {
          return new Response("Not found", { status: 404 });
        }
        return new Response("203.0.113.5", { status: 200 });
      }),
    );

    const result = await fetchConnectionInfo();
    expect(result.china.ipv6).toEqual({ status: "unavailable", reason: "http" });
  });

  it("propagates caller cancellation", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchConnectionInfo(controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
