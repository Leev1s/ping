/** Public connection details fetched directly from Cloudflare and IPinfo. */

export type IpFamily = "IPv4" | "IPv6";

export type ConnectionExit = {
  ip: string;
  family: IpFamily;
  countryCode?: string;
  city?: string;
  region?: string;
  asn?: string;
  organization?: string;
  colo?: string;
  tls?: string;
  warp?: string;
};

export type ConnectionReport = {
  cloudflare: ConnectionExit | null;
  ipinfo: ConnectionExit | null;
};

const CLOUDFLARE_TRACE_URL = "https://one.one.one.one/cdn-cgi/trace";
const IPINFO_URL = "https://ipinfo.io/json";
const REQUEST_TIMEOUT_MS = 4_500;

function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException("The operation was aborted", "AbortError")
  );
}

async function request<T>(
  url: string,
  parse: (response: Response) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
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
    return await parse(response);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

function parseTrace(body: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of body.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) {
      values.set(line.slice(0, separator), line.slice(separator + 1));
    }
  }
  return values;
}

function getFamily(ip: string): IpFamily {
  return ip.includes(":") ? "IPv6" : "IPv4";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseOrganization(org: string | undefined): {
  asn?: string;
  organization?: string;
} {
  if (!org) return {};
  const match = org.match(/^(AS\d+)\s*(.*)$/i);
  return match
    ? { asn: match[1].toUpperCase(), organization: match[2] || undefined }
    : { organization: org };
}

async function readCloudflare(
  signal?: AbortSignal,
): Promise<ConnectionExit | null> {
  try {
    return await request(
      CLOUDFLARE_TRACE_URL,
      async (response) => {
        if (!response.ok) return null;
        const values = parseTrace(await response.text());
        const ip = optionalString(values.get("ip"));
        if (!ip) return null;
        return {
          ip,
          family: getFamily(ip),
          countryCode: optionalString(values.get("loc")),
          colo: optionalString(values.get("colo")),
          tls: optionalString(values.get("tls")),
          warp: optionalString(values.get("warp")),
        };
      },
      signal,
    );
  } catch (error) {
    if (signal?.aborted) throw abortReason(signal);
    return null;
  }
}

type IpinfoResponse = {
  ip?: unknown;
  country?: unknown;
  city?: unknown;
  region?: unknown;
  org?: unknown;
};

async function readIpinfo(
  signal?: AbortSignal,
): Promise<ConnectionExit | null> {
  try {
    return await request(
      IPINFO_URL,
      async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as IpinfoResponse;
        const ip = optionalString(data.ip);
        if (!ip) return null;
        return {
          ip,
          family: getFamily(ip),
          countryCode: optionalString(data.country),
          city: optionalString(data.city),
          region: optionalString(data.region),
          ...parseOrganization(optionalString(data.org)),
        };
      },
      signal,
    );
  } catch (error) {
    if (signal?.aborted) throw abortReason(signal);
    return null;
  }
}

/** Read each provider once; source-specific addresses and metadata stay separate. */
export async function fetchConnectionInfo(
  signal?: AbortSignal,
): Promise<ConnectionReport> {
  if (signal?.aborted) throw abortReason(signal);
  const [cloudflare, ipinfo] = await Promise.all([
    readCloudflare(signal),
    readIpinfo(signal),
  ]);
  return { cloudflare, ipinfo };
}
