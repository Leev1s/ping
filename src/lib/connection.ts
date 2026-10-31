/** Public IPv4 and IPv6 exit addresses from a mainland and an overseas source. */

export type IpLookupResult =
  | { status: "ok"; ip: string }
  | { status: "unsupported" }
  | { status: "unavailable"; reason: "network" | "http" | "invalid" };

export type ConnectionProvider = {
  provider: "dnspod" | "icanhazip";
  ipv4: IpLookupResult;
  ipv6: IpLookupResult;
};

export type ConnectionReport = {
  china: ConnectionProvider;
  international: ConnectionProvider;
};

const ENDPOINTS = {
  china: {
    provider: "dnspod",
    ipv4: "https://ipv4.ddnspod.com/checkip",
    ipv6: "https://ipv6.ddnspod.com/checkip",
  },
  international: {
    provider: "icanhazip",
    ipv4: "https://ipv4.icanhazip.com/",
    ipv6: "https://ipv6.icanhazip.com/",
  },
} as const;

const REQUEST_TIMEOUT_MS = 4_500;

function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException("The operation was aborted", "AbortError")
  );
}

function isAddress(value: string, family: "ipv4" | "ipv6"): boolean {
  if (family === "ipv4") {
    const groups = value.split(".");
    return (
      groups.length === 4 &&
      groups.every((group) => {
        if (!/^\d{1,3}$/.test(group)) return false;
        const octet = Number(group);
        return octet >= 0 && octet <= 255;
      })
    );
  }

  if (!value.includes(":") || !/^[\da-f:.]+$/i.test(value)) return false;
  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

async function readAddress(
  url: string,
  family: "ipv4" | "ipv6",
  signal?: AbortSignal,
): Promise<IpLookupResult> {
  if (signal?.aborted) throw abortReason(signal);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.status === 501) return { status: "unsupported" };
    if (!response.ok) return { status: "unavailable", reason: "http" };

    const ip = (await response.text()).trim();
    return isAddress(ip, family)
      ? { status: "ok", ip }
      : { status: "unavailable", reason: "invalid" };
  } catch {
    if (signal?.aborted) throw abortReason(signal);
    return { status: "unavailable", reason: "network" };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function readProvider(
  provider: ConnectionProvider["provider"],
  urls: { ipv4: string; ipv6: string },
  signal?: AbortSignal,
): Promise<ConnectionProvider> {
  const [ipv4, ipv6] = await Promise.all([
    readAddress(urls.ipv4, "ipv4", signal),
    readAddress(urls.ipv6, "ipv6", signal),
  ]);
  return { provider, ipv4, ipv6 };
}

/** Read all four source/family combinations independently, preserving partial results. */
export async function fetchConnectionInfo(
  signal?: AbortSignal,
): Promise<ConnectionReport> {
  if (signal?.aborted) throw abortReason(signal);

  const [china, international] = await Promise.all([
    readProvider(
      ENDPOINTS.china.provider,
      { ipv4: ENDPOINTS.china.ipv4, ipv6: ENDPOINTS.china.ipv6 },
      signal,
    ),
    readProvider(
      ENDPOINTS.international.provider,
      {
        ipv4: ENDPOINTS.international.ipv4,
        ipv6: ENDPOINTS.international.ipv6,
      },
      signal,
    ),
  ]);

  return { china, international };
}

export type LocationResult = {
  status: "ok" | "unavailable";
  family?: "ipv4" | "ipv6";
  location?: string;
  network?: string;
};
export type LocationReport = Partial<
  Record<keyof ConnectionReport, LocationResult>
>;

/** Enrich the actual observed address, once per refresh, outside the probe loop. */
export async function fetchLocationInfo(
  report: ConnectionReport,
  signal?: AbortSignal,
): Promise<LocationReport> {
  const requests = new Map<string, Promise<LocationResult>>();
  const lookup = async (
    ip: string,
    family: "ipv4" | "ipv6",
  ): Promise<LocationResult> => {
    if (signal?.aborted) throw abortReason(signal);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const response = await fetch(
        `https://ipinfo.io/${encodeURIComponent(ip)}/json`,
        {
          mode: "cors",
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        },
      );
      if (!response.ok) return { status: "unavailable", family };
      const data = (await response.json()) as Record<string, unknown>;
      const normalize = (value: string) =>
        value.includes(":") ? new URL(`http://[${value}]/`).hostname : value;
      if (typeof data.ip !== "string" || normalize(data.ip) !== normalize(ip))
        return { status: "unavailable", family };
      const string = (key: string) =>
        typeof data[key] === "string" ? (data[key] as string).trim() : "";
      const location = [
        ...new Set(
          [string("city"), string("region"), string("country")].filter(Boolean),
        ),
      ].join(", ");
      const network = string("org");
      return {
        status: location || network ? "ok" : "unavailable",
        family,
        location,
        network,
      };
    } catch {
      if (signal?.aborted) throw abortReason(signal);
      return { status: "unavailable", family };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  };
  return Object.fromEntries(
    await Promise.all(
      (Object.keys(report) as (keyof ConnectionReport)[]).map(
        async (region) => {
          const provider = report[region];
          const family = provider.ipv4.status === "ok" ? "ipv4" : "ipv6";
          const address = provider[family];
          if (address.status !== "ok")
            return [region, { status: "unavailable" }];
          if (!requests.has(address.ip))
            requests.set(address.ip, lookup(address.ip, family));
          return [region, await requests.get(address.ip)!];
        },
      ),
    ),
  );
}
