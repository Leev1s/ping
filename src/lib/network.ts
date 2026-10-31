/**
 * Browser-side network probes.
 *
 * A CORS probe can confirm that the endpoint returned a successful HTTP
 * response. An opaque probe can only measure time until fetch exposes a
 * response to the browser; its status is intentionally never treated as verified.
 */

export type ProbeTarget = {
  id: string;
  name: string;
  url: string;
  region: "global" | "cn";
  method: "cors" | "opaque";
};

export const TARGETS: ProbeTarget[] = [
  {
    id: "baidu",
    name: "Baidu",
    url: "https://www.baidu.com/favicon.ico",
    region: "cn",
    method: "opaque",
  },
  {
    id: "bilibili",
    name: "Bilibili",
    url: "https://www.bilibili.com/favicon.ico",
    region: "cn",
    method: "opaque",
  },
  {
    id: "wechat",
    name: "WeChat",
    url: "https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico",
    region: "cn",
    method: "opaque",
  },
  {
    id: "taobao",
    name: "Taobao",
    url: "https://www.taobao.com/favicon.ico",
    region: "cn",
    method: "opaque",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    url: "https://speed.cloudflare.com/__down?bytes=0",
    region: "global",
    method: "cors",
  },
  {
    id: "google",
    name: "Google",
    url: "https://www.gstatic.com/generate_204",
    region: "global",
    method: "opaque",
  },
  {
    id: "github",
    name: "GitHub",
    url: "https://github.com/favicon.ico",
    region: "global",
    method: "opaque",
  },
  {
    id: "microsoft",
    name: "Microsoft",
    url: "https://www.bing.com/favicon.ico",
    region: "global",
    method: "opaque",
  },
];

export type Sample = {
  at: number;
  latency: number | null;
  outcome: "ok" | "timeout" | "error" | "unverified";
  /** Needed to distinguish a failed opaque fetch from a verifiable outage. */
  verification?: "cors" | "opaque";
};

const PROBE_TIMEOUT_MS = 4_500;

function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException("The operation was aborted", "AbortError")
  );
}

function withCacheBust(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.set(
    "_ping",
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  return url.toString();
}

function elapsedSince(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

export async function probe(
  target: ProbeTarget,
  signal?: AbortSignal,
): Promise<Sample> {
  const startedAt = performance.now();
  const at = () => Date.now();

  if (signal?.aborted) throw abortReason(signal);

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PROBE_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    // Fetch resolves when response headers arrive. We intentionally don't drain
    // the body, so this is a consistent header/TTFB measurement for all targets.
    const response = await fetch(withCacheBust(target.url), {
      method: "GET",
      mode: target.method === "cors" ? "cors" : "no-cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });

    const latency = elapsedSince(startedAt);
    if (
      target.method === "opaque" ||
      response.type === "opaque" ||
      response.type === "opaqueredirect"
    ) {
      return {
        at: at(),
        latency,
        outcome: "unverified",
        verification: target.method,
      };
    }

    return {
      at: at(),
      latency,
      outcome: response.ok ? "ok" : "error",
      verification: target.method,
    };
  } catch {
    if (signal?.aborted) throw abortReason(signal);
    if (timedOut)
      return {
        at: at(),
        latency: null,
        outcome: "timeout",
        verification: target.method,
      };
    return {
      at: at(),
      latency: null,
      outcome: "error",
      verification: target.method,
    };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}
