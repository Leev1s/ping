import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchConnectionInfo } from "./connection";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchConnectionInfo", () => {
  it("returns separate Cloudflare and IPinfo observations", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.includes("one.one.one.one")) {
          return new Response(
            "ip=2001:db8::8\nloc=SG\ncolo=SIN\ntls=TLSv1.3\nwarp=off\n",
            { status: 200 },
          );
        }
        if (url === "https://ipinfo.io/json") {
          return new Response(
            JSON.stringify({
              ip: "203.0.113.8",
              country: "SG",
              city: "Singapore",
              region: "Singapore",
              org: "AS64500 Example Network",
            }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchConnectionInfo();

    expect(result).toEqual({
      cloudflare: {
        ip: "2001:db8::8",
        family: "IPv6",
        countryCode: "SG",
        colo: "SIN",
        tls: "TLSv1.3",
        warp: "off",
      },
      ipinfo: {
        ip: "203.0.113.8",
        family: "IPv4",
        countryCode: "SG",
        city: "Singapore",
        region: "Singapore",
        asn: "AS64500",
        organization: "Example Network",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([
        "https://one.one.one.one/cdn-cgi/trace",
        "https://ipinfo.io/json",
      ]),
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

  it("keeps partial results when either provider fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("one.one.one.one")) {
          return new Response("ip=198.51.100.4\nloc=JP\ncolo=NRT\n", {
            status: 200,
          });
        }
        return new Response("rate limited", { status: 429 });
      }),
    );

    await expect(fetchConnectionInfo()).resolves.toEqual({
      cloudflare: {
        ip: "198.51.100.4",
        family: "IPv4",
        countryCode: "JP",
        colo: "NRT",
      },
      ipinfo: null,
    });
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
