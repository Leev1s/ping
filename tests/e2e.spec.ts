import { expect, test, type Locator, type Page } from "@playwright/test";

const probeHosts = [
  "speed.cloudflare.com",
  "cdn.jsdelivr.net",
  "github.com",
  "www.bing.com",
  "www.baidu.com",
  "www.bilibili.com",
  "res.wx.qq.com",
  "www.taobao.com",
] as const;

const connectionHosts = [
  "ipv4.ddnspod.com",
  "ipv6.ddnspod.com",
  "ipv4.icanhazip.com",
  "ipv6.icanhazip.com",
] as const;

const corsHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};

const testAddresses = {
  chinaV4: "203.0.113.27",
  chinaV6: "2001:db8::27",
  internationalV4: "203.0.113.41",
  internationalV6: "2001:db8::41",
};

const themes = [
  "light",
  "dark",
  "light-neutral",
  "dark-neutral",
  "halloween",
  "forest",
  "dracula",
  "night",
  "dim",
  "nord",
  "sunset",
  "abyss",
  "cupcake",
  "dark-daisyui5",
  "gruvbox",
] as const;

const themeLabels = [
  "Light",
  "Dark",
  "Light neutral",
  "Dark neutral",
  "Halloween",
  "Forest",
  "Dracula",
  "Night",
  "Dim",
  "Nord",
  "Sunset",
  "Abyss",
  "Cupcake",
  "Dark daisyUI 5",
  "Gruvbox",
] as const;

type Scenario = {
  delayByHost?: Record<string, number>;
  unreachableProbeHost?: string;
  unsupportedIpUrl?: string;
  unreachableIpUrl?: string;
};

type ProbeWindow = Window & {
  __probeActive?: Record<string, number>;
  __probeMaxActive?: Record<string, number>;
  __pingSetHidden?: (hidden: boolean) => void;
};

type NetworkSession = {
  requests: string[];
  setScenario: (scenario: Scenario) => void;
};

async function installClock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-31T00:00:00.000Z") });
}

async function mockNetwork(
  page: Page,
  responseDelayMs = 0,
): Promise<NetworkSession> {
  const requests: string[] = [];
  let scenario: Scenario = {};

  await page.addInitScript((hosts: string[]) => {
    const state = window as ProbeWindow;
    state.__probeActive = {};
    state.__probeMaxActive = {};
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      let host: string | undefined;
      let active = false;
      const finish = () => {
        if (!host || !active) return;
        state.__probeActive![host] = Math.max(
          0,
          (state.__probeActive![host] ?? 1) - 1,
        );
        active = false;
      };
      try {
        const rawUrl = input instanceof Request ? input.url : String(input);
        host = new URL(rawUrl).hostname;
        if (!hosts.includes(host)) host = undefined;
        if (host) {
          const count = (state.__probeActive![host] ?? 0) + 1;
          state.__probeActive![host] = count;
          state.__probeMaxActive![host] = Math.max(
            state.__probeMaxActive![host] ?? 0,
            count,
          );
          active = true;
          init?.signal?.addEventListener("abort", finish, { once: true });
        }
      } catch {
        // Keep the browser's normal fetch error for malformed requests.
      }
      return originalFetch(input, init).finally(finish);
    };
  }, [...probeHosts]);

  page.on("request", (request) => requests.push(request.url()));
  await page.route("https://**/*", async (route) => {
    const url = new URL(route.request().url());
    const rawIpUrl = `${url.origin}${url.pathname}`;
    if ((connectionHosts as readonly string[]).includes(url.hostname)) {
      if (scenario.unreachableIpUrl === rawIpUrl) {
        await route.abort();
        return;
      }
      if (scenario.unsupportedIpUrl === rawIpUrl) {
        await route.fulfill({ status: 501, headers: corsHeaders, body: "" });
        return;
      }
      const addresses: Record<string, string> = {
        "ipv4.ddnspod.com": testAddresses.chinaV4,
        "ipv6.ddnspod.com": testAddresses.chinaV6,
        "ipv4.icanhazip.com": testAddresses.internationalV4,
        "ipv6.icanhazip.com": testAddresses.internationalV6,
      };
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "text/plain" },
        body: `${addresses[url.hostname]}\n`,
      });
      return;
    }

    if ((probeHosts as readonly string[]).includes(url.hostname)) {
      const currentScenario = scenario;
      const delay =
        currentScenario.delayByHost?.[url.hostname] ?? responseDelayMs;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (currentScenario.unreachableProbeHost === url.hostname) {
        await route.abort();
        return;
      }
      try {
        await route.fulfill({
          status: 200,
          headers: {
            ...corsHeaders,
            "content-type": "application/octet-stream",
          },
          body: "",
        });
      } catch {
        // A probe may be aborted while its route is waiting.
      }
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });

  return { requests, setScenario: (next) => (scenario = next) };
}

function countHost(requests: string[], host: string): number {
  return requests.filter((rawUrl) => new URL(rawUrl).hostname === host).length;
}

async function waitForRequests(requests: string[], count: number) {
  await expect
    .poll(() => requests.length, { timeout: 7_000 })
    .toBeGreaterThanOrEqual(count);
}

async function waitForHostRequests(
  requests: string[],
  host: string,
  count: number,
) {
  await expect
    .poll(() => countHost(requests, host), { timeout: 7_000 })
    .toBeGreaterThanOrEqual(count);
}

async function waitForAllProbes(requests: string[]) {
  for (const host of probeHosts) await waitForHostRequests(requests, host, 1);
}

async function waitForConnectionSources(requests: string[]) {
  for (const host of connectionHosts)
    await waitForHostRequests(requests, host, 1);
}

async function advanceProbeCycles(
  page: Page,
  requests: string[],
  cycles: number,
  seconds = 3,
) {
  if (seconds >= 4.5)
    throw new Error("Use a sub-timeout sample interval in e2e");
  let expectedRequests = requests.length;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    expectedRequests += probeHosts.length;
    await page.clock.fastForward(seconds * 1_000 + 100);
    await waitForRequests(requests, expectedRequests);
  }
}

function cardFor(page: Page, name: string): Locator {
  return page.locator("article.probe-card").filter({
    has: page.locator(".probe-name", { hasText: new RegExp(name) }),
  });
}

async function clickMoreAction(page: Page, name: string) {
  await page.getByRole("button", { name: "More options" }).click();
  const menu = page.getByRole("dialog", { name: "More options" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name, exact: true }).click();
}

async function readDownload(page: Page, action: string) {
  const downloadPromise = page.waitForEvent("download");
  await clickMoreAction(page, action);
  const stream = await (await downloadPromise).createReadStream();
  if (!stream) throw new Error("Export stream unavailable");
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text) as {
    targets: Array<{
      id: string;
      samples: unknown[];
      total: number;
      failures: number;
    }>;
    windowMinutes: number;
    retentionLimit: number;
  };
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return [x, y, width, height].map((value) => Math.round(value * 10) / 10);
    };
    return {
      cards: [...document.querySelectorAll("article.probe-card")].map(rect),
      plots: [...document.querySelectorAll("svg.boxplot")].map(rect),
      connections: [...document.querySelectorAll(".connection-card")].map(rect),
    };
  });
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const hex = color.trim().match(/^#([\da-f]{6})$/i)?.[1];
    if (!hex)
      throw new Error(`Expected a computed six-digit hex color, got ${color}`);
    const channels = [0, 2, 4].map(
      (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
    );
    const [r, g, b] = channels.map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function parseCount(text: string): number {
  const firstCount = text.match(/\d[\d,]*/)?.[0];
  return firstCount ? Number(firstCount.replaceAll(",", "")) : 0;
}

async function regionScales(page: Page, region: "cn" | "global") {
  return page
    .locator(`.region-panel[data-region="${region}"] svg.boxplot`)
    .evaluateAll((plots) => plots.map((plot) => Number(plot.getAttribute("data-scale"))));
}

test("renders eight probes, two IPv4/IPv6 exits, and the ordered toolbar", async ({
  page,
}) => {
  const session = await mockNetwork(page);
  await page.goto("/");

  const cards = page.locator("article.probe-card");
  await expect(cards).toHaveCount(8);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Network status",
  );
  await expect(page.locator(".probe-name")).toHaveCount(8);
  await expect(page.locator(".probe-latest")).toHaveCount(8);
  await expect(page.locator(".probe-stats")).toHaveCount(8);
  await expect(page.locator("svg.boxplot")).toHaveCount(8);
  await expect(page.locator(".p95-value")).toHaveCount(8);
  await expect(page.locator(".latency-dot")).toHaveCount(8);
  await expect(page.locator(".service-avatar, .probe-status")).toHaveCount(0);

  const toolbar = page.locator(".toolbar button");
  await expect(toolbar).toHaveCount(3);
  await expect(toolbar.nth(0)).toHaveClass(/live-control/);
  await expect(toolbar.nth(0)).toHaveAttribute("title", /Pause sampling/);
  await expect(toolbar.nth(0).locator(".cadence")).toHaveText("3s");
  await expect(toolbar.nth(1)).toHaveAttribute(
    "aria-label",
    "Color theme: Light",
  );
  await expect(toolbar.nth(2)).toHaveAttribute("aria-label", "More options");

  await expect
    .poll(async () => page.locator(".p95-value").first().innerText())
    .toMatch(/~\s*\d/);

  const axis = page.locator(".plot-axis").first();
  await expect(axis).toHaveAttribute(
    "aria-label",
    /^Linear 0–\d+ millisecond scale$/,
  );
  await expect(axis.locator("span").first()).toHaveText("0");
  await expect(axis.locator("span").last()).toContainText("ms");
  const initialChinaScales = await regionScales(page, "cn");
  const initialInternationalScales = await regionScales(page, "global");
  expect(new Set(initialChinaScales).size).toBe(1);
  expect(new Set(initialInternationalScales).size).toBe(1);

  await expect(page.locator(".connection-card")).toHaveCount(2);
  const chinaCard = page.locator('.connection-card[data-provider="china"]');
  const internationalCard = page.locator(
    '.connection-card[data-provider="international"]',
  );
  await expect(chinaCard.locator(".exit-source")).toHaveText("Tencent DNSPod");
  await expect(internationalCard.locator(".exit-source")).toHaveText(
    "ICanHazIP",
  );
  await expect(page.locator(".address-row")).toHaveCount(4);
  await expect(page.locator(".address-label")).toHaveText([
    "IPv4",
    "IPv6",
    "IPv4",
    "IPv6",
  ]);

  const names = (await page.locator(".probe-name").allTextContents()).map(
    (name) => name.trim(),
  );
  expect(new Set(names)).toEqual(
    new Set([
      "Cloudflare",
      "jsDelivr",
      "GitHub",
      "Microsoft",
      "Baidu",
      "Bilibili",
      "WeChat",
      "Taobao",
    ]),
  );
  await expect(
    page.locator('.region-panel[data-region="cn"] article.probe-card'),
  ).toHaveCount(4);
  await expect(
    page.locator('.region-panel[data-region="global"] article.probe-card'),
  ).toHaveCount(4);

  await waitForAllProbes(session.requests);
  await waitForConnectionSources(session.requests);
  await expect(chinaCard.locator(".exit-address")).toHaveCount(2);
  await expect(internationalCard.locator(".exit-address")).toHaveCount(2);
  await expect(chinaCard.locator(".exit-address").first()).toHaveText(
    "••••••••",
  );
  await page.getByRole("button", { name: "Show addresses" }).click();
  await expect(chinaCard.locator(".exit-address").nth(0)).toHaveText(
    testAddresses.chinaV4,
  );
  await expect(chinaCard.locator(".exit-address").nth(1)).toHaveText(
    testAddresses.chinaV6,
  );
  await expect(internationalCard.locator(".exit-address").nth(0)).toHaveText(
    testAddresses.internationalV4,
  );
  await expect(internationalCard.locator(".exit-address").nth(1)).toHaveText(
    testAddresses.internationalV6,
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copy full IPv6 address from China exit" })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(testAddresses.chinaV6);
  await page.getByRole("button", { name: "Hide addresses" }).click();

  for (const host of [...probeHosts, ...connectionHosts]) {
    expect(countHost(session.requests, host), host).toBeGreaterThanOrEqual(1);
  }
  expect(countHost(session.requests, "www.gstatic.com")).toBe(0);

  await page.getByRole("button", { name: "More options" }).click();
  const options = page.getByRole("dialog", { name: "More options" });
  await expect(options).toBeVisible();
  await expect(options.getByLabel("History window")).toHaveCount(0);
  await expect(options.getByRole("button", { name: /plot scale/i })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
});

test("theme menu is accessible, scrollable, persistent, and does not resize the page", async ({
  page,
}) => {
  const session = await mockNetwork(page);
  await page.goto("/");
  await waitForAllProbes(session.requests);
  await waitForConnectionSources(session.requests);
  await page.evaluate(() => document.fonts.ready);

  const fonts = await page.evaluate(() => {
    const text = document.body.innerText;
    const families = new Set(
      [...document.fonts].map((font) => font.family.replaceAll('"', "").trim()),
    );
    const files = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\.(woff2?|ttf|otf)(\?|$)/i.test(name));
    return {
      hasCjk: /[\u3400-\u9fff]/.test(text),
      lang: document.documentElement.lang,
      families: [...families],
      files,
      external: files.filter((name) => new URL(name).origin !== location.origin),
    };
  });
  expect(fonts.hasCjk).toBe(false);
  expect(fonts.lang).toBe("en");
  expect(new Set(fonts.families)).toEqual(
    new Set(["Inter", "JetBrains Mono", "Space Grotesk"]),
  );
  expect(fonts.files.length).toBeGreaterThanOrEqual(3);
  expect(fonts.external).toEqual([]);

  const trigger = page.locator(".theme-picker-trigger");
  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  const menu = page.getByRole("listbox", { name: "Color theme" });
  const sizes = [[320, 568], [1440, 900]] as const;
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const referenceGeometry = await geometry(page);
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("option")).toHaveCount(themes.length);
    expect((await menu.getByRole("option").allTextContents()).map((item) => item.trim())).toEqual(themeLabels);
    const scroll = await menu.evaluate((element) => ({
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      rect: element.getBoundingClientRect().toJSON(),
    }));
    expect(scroll.overflowY).toBe("auto");
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    expect(scroll.rect.right).toBeLessThanOrEqual(width + 1);
    expect(scroll.rect.bottom).toBeLessThanOrEqual(height + 1);
    expect(await geometry(page)).toEqual(referenceGeometry);

    await page.keyboard.press("End");
    const last = menu.getByRole("option", { name: "Gruvbox" });
    await expect(last).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu).not.toBeVisible();
    for (const [index, theme] of themes.entries()) {
      await trigger.click();
      await menu
        .getByRole("option", { name: themeLabels[index], exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(trigger).toHaveAttribute(
        "aria-label",
        `Color theme: ${themeLabels[index]}`,
      );

      const colors = await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector(".app-shell")!);
        return Object.fromEntries(
          ["--ink", "--muted", "--danger", "--surface", "--canvas"].map(
            (token) => [token, style.getPropertyValue(token).trim()],
          ),
        ) as Record<string, string>;
      });
      for (const foreground of ["--ink", "--muted", "--danger"]) {
        for (const background of ["--surface", "--canvas"]) {
          expect(
            contrastRatio(colors[foreground], colors[background]),
            `${theme} ${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(await geometry(page)).toEqual(referenceGeometry);
    }
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ),
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  }

  await trigger.click();
  await menu.getByRole("option", { name: "Cupcake" }).click();
  await page.reload();
  await expect(page.locator(".theme-picker-trigger")).toHaveAttribute(
    "aria-label",
    "Color theme: Cupcake",
  );
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(
    "cupcake",
  );
});

test("uses a three-second default and accepts manually entered sampling intervals", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-31T00:00:00.000Z") });
  await page.addInitScript(() => {
    localStorage.setItem("ping-interval", "10");
  });
  const session = await mockNetwork(page);
  await page.goto("/");
  await waitForAllProbes(session.requests);
  await expect(page.locator(".live-control .cadence")).toHaveText("3s");

  await page.getByRole("button", { name: "More options" }).click();
  const menu = page.getByRole("dialog", { name: "More options" });
  await expect(menu).toBeVisible();
  const interval = menu.getByLabel("Sampling interval");
  await expect(interval).toHaveAttribute("type", "number");
  await expect(interval).toHaveAttribute("min", "1");
  await expect(interval).toHaveAttribute("max", "300");
  await expect(interval).toHaveAttribute("step", "any");
  await expect(interval).toHaveValue("3");
  await expect(menu.getByLabel("History window")).toHaveCount(0);
  await expect(menu.getByRole("button", { name: /plot scale/i })).toHaveCount(
    0,
  );

  const storedBeforeInvalid = await page.evaluate(() =>
    localStorage.getItem("ping-interval-seconds"),
  );
  await interval.fill("0");
  await menu.getByRole("button", { name: "Apply interval" }).click();
  await expect(menu).toBeVisible();
  await expect(page.locator(".live-control .cadence")).toHaveText("3s");
  expect(
    await page.evaluate(() => localStorage.getItem("ping-interval-seconds")),
  ).toBe(storedBeforeInvalid);

  const beforeApply = session.requests.length;
  await interval.fill("1.5");
  await menu.getByRole("button", { name: "Apply interval" }).click();
  await expect(menu).not.toBeVisible();
  await expect(page.locator(".live-control .cadence")).toHaveText("1.5s");
  expect(
    await page.evaluate(() => localStorage.getItem("ping-interval-seconds")),
  ).toBe("1.5");
  await waitForRequests(session.requests, beforeApply + probeHosts.length);
  await advanceProbeCycles(page, session.requests, 1, 1.5);
});

test("keeps measuring beyond sixty attempts and bounds plots and exported history", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installClock(page);
  const session = await mockNetwork(page);
  await page.goto("/");
  await waitForAllProbes(session.requests);
  await advanceProbeCycles(page, session.requests, 60);

  for (const name of [
    "Cloudflare",
    "jsDelivr",
    "GitHub",
    "Microsoft",
    "Baidu",
    "Bilibili",
    "WeChat",
    "Taobao",
  ]) {
    const card = cardFor(page, name);
    expect(await card.locator("circle.sample-point").count()).toBeLessThanOrEqual(
      120,
    );
    await expect(card.locator("rect.iqr-box")).toHaveCount(1);
    await expect(card.locator(".median-line")).toHaveCount(1);
  }

  const opacity = await page
    .locator("circle.sample-point")
    .evaluateAll((points) =>
      points.map((point) => {
        const style = getComputedStyle(point);
        const opacity = point.getAttribute("opacity") ?? style.opacity;
        const fill = point.getAttribute("fill-opacity") ?? style.fillOpacity;
        return Number(opacity) * Number(fill);
      }),
    );
  expect(opacity.length).toBeGreaterThan(8);
  expect(Math.max(...opacity)).toBeGreaterThan(Math.min(...opacity));

  const sessionTotal = parseCount(await page.locator(".session-total").innerText());
  const retainedTotal = parseCount(
    await page.locator(".retained-total").innerText(),
  );
  expect(sessionTotal).toBeGreaterThan(8 * 60);
  expect(retainedTotal).toBeGreaterThan(8 * 60);
  expect(retainedTotal).toBeLessThanOrEqual(8 * 1_200);
  for (const value of await page.locator(".p95-value").all()) {
    await expect(value).not.toContainText("~");
    await expect(value).toHaveText(/\d/);
  }

  const maxInFlight = await page.evaluate(() =>
    Math.max(...Object.values((window as ProbeWindow).__probeMaxActive ?? {})),
  );
  expect(maxInFlight).toBe(1);

  const payload = await readDownload(page, "Export data");
  expect(payload.targets).toHaveLength(8);
  expect(payload.windowMinutes).toBe(30);
  expect(payload.retentionLimit).toBe(1_200);
  for (const target of payload.targets) {
    expect(target.samples.length, target.id).toBeGreaterThan(60);
    expect(target.samples.length, target.id).toBeLessThanOrEqual(1_200);
    expect(target.total).toBeGreaterThan(60);
    expect(target.failures).toBe(0);
  }
  const exported = JSON.stringify(payload);
  for (const address of Object.values(testAddresses))
    expect(exported).not.toContain(address);
});

test("uses a changing shared scale per region and shows probe failures without losing prior samples", async ({
  page,
}) => {
  await installClock(page);
  const session = await mockNetwork(page);
  await page.goto("/");
  await waitForAllProbes(session.requests);
  await expect(page.locator("article.probe-card")).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
  const emptyGeometry = await geometry(page);
  await advanceProbeCycles(page, session.requests, 3);

  const initialChina = await regionScales(page, "cn");
  const initialInternational = await regionScales(page, "global");
  expect(new Set(initialChina).size).toBe(1);
  expect(new Set(initialInternational).size).toBe(1);

  session.setScenario({
    delayByHost: {
      "www.baidu.com": 600,
      "speed.cloudflare.com": 1_200,
    },
  });
  const beforeDelay = session.requests.length;
  await advanceProbeCycles(page, session.requests, 1);
  await expect
    .poll(async () => {
      const text = await cardFor(page, "Baidu").locator(".probe-latest").innerText();
      return Number.parseFloat(text.replace(/[^\d.]/g, "")) || 0;
    })
    .toBeGreaterThan(500);
  await expect
    .poll(async () => {
      const text = await cardFor(page, "Cloudflare")
        .locator(".probe-latest")
        .innerText();
      return Number.parseFloat(text.replace(/[^\d.]/g, "")) || 0;
    })
    .toBeGreaterThan(1_000);
  expect(session.requests.length).toBeGreaterThan(beforeDelay);

  const updatedChina = await regionScales(page, "cn");
  const updatedInternational = await regionScales(page, "global");
  expect(new Set(updatedChina).size).toBe(1);
  expect(new Set(updatedInternational).size).toBe(1);
  expect(updatedChina[0]).toBeGreaterThan(initialChina[0]);
  expect(updatedInternational[0]).toBeGreaterThan(initialInternational[0]);
  expect(updatedChina[0]).toBeLessThan(updatedInternational[0]);
  for (const [region, scale] of [
    ["cn", updatedChina[0]],
    ["global", updatedInternational[0]],
  ] as const) {
    const axis = page.locator(`.region-panel[data-region="${region}"] .plot-axis`);
    await expect(axis.first()).toHaveAttribute(
      "aria-label",
      `Linear 0–${scale} millisecond scale`,
    );
    await expect(axis.first().locator("span").first()).toHaveText("0");
  }
  expect(await geometry(page)).toEqual(emptyGeometry);

  const cloudflare = cardFor(page, "Cloudflare");
  const oldPointCount = await cloudflare.locator("circle.sample-point").count();
  session.setScenario({ unreachableProbeHost: "speed.cloudflare.com" });
  await page.getByRole("button", { name: "Pause" }).click();
  const errorRequestCount = countHost(session.requests, "speed.cloudflare.com");
  await page.getByRole("button", { name: "Resume" }).click();
  await waitForHostRequests(
    session.requests,
    "speed.cloudflare.com",
    errorRequestCount + 1,
  );
  await expect(cloudflare.locator(".reading-state")).toHaveText("No reply");
  await expect(cloudflare).toHaveClass(/is-unreachable/);
  await expect(cloudflare.locator(".latency-dot")).toHaveAttribute(
    "aria-label",
    "Failed",
  );
  expect(await cloudflare.locator("circle.sample-point").count()).toBeGreaterThan(
    0,
  );
  expect(await cloudflare.locator("circle.sample-point").count()).toBeLessThanOrEqual(
    oldPointCount + 1,
  );
  expect(await geometry(page)).toEqual(emptyGeometry);
});

test("distinguishes unsupported address families from network failures", async ({
  page,
}) => {
  const session = await mockNetwork(page);
  await page.goto("/");
  await waitForConnectionSources(session.requests);
  await page.getByRole("button", { name: "Show addresses" }).click();

  session.setScenario({
    unsupportedIpUrl: "https://ipv6.ddnspod.com/checkip",
    unreachableIpUrl: "https://ipv4.icanhazip.com/",
  });
  const counts = Object.fromEntries(
    connectionHosts.map((host) => [host, countHost(session.requests, host)]),
  );
  await page.getByRole("button", { name: "Refresh connection info" }).click();
  for (const host of connectionHosts) {
    await waitForHostRequests(session.requests, host, counts[host] + 1);
  }

  const chinaCard = page.locator('.connection-card[data-provider="china"]');
  const internationalCard = page.locator(
    '.connection-card[data-provider="international"]',
  );
  await expect(chinaCard.locator(".address-row").nth(0).locator(".exit-address"))
    .not.toHaveText("Unavailable");
  await expect(
    chinaCard.locator(".address-row").nth(1).locator(".exit-address"),
  ).toHaveText("Not supported");
  await expect(
    internationalCard
      .locator(".address-row")
      .nth(0)
      .locator(".exit-address"),
  ).toHaveText("Unavailable");
  await expect(
    internationalCard
      .locator(".address-row")
      .nth(1)
      .locator(".exit-address"),
  ).toHaveText(testAddresses.internationalV6);
});

test("keeps measurements running while the page is hidden and pauses on request", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    (window as ProbeWindow).__pingSetHidden = (nextHidden) => {
      hidden = nextHidden;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  const session = await mockNetwork(page);
  await page.goto("/");
  await waitForAllProbes(session.requests);

  await page.getByRole("button", { name: "More options" }).click();
  const menu = page.getByRole("dialog", { name: "More options" });
  await menu.getByLabel("Sampling interval").fill("1");
  await menu.getByRole("button", { name: "Apply interval" }).click();
  await waitForRequests(session.requests, probeHosts.length * 2 + connectionHosts.length);

  await expect(page.locator(".latency-dot.is-probing")).toHaveCount(0);
  const beforeHiddenCycle = session.requests.length;
  await page.evaluate(() => (window as ProbeWindow).__pingSetHidden?.(true));
  await expect(page.locator(".status-badge")).toHaveText("Background");
  await waitForRequests(session.requests, beforeHiddenCycle + probeHosts.length);
  await expect(page.locator(".latency-dot.is-probing")).toHaveCount(0);
  const beforeForeground = session.requests.length;
  await page.evaluate(() => (window as ProbeWindow).__pingSetHidden?.(false));
  await expect(page.locator(".status-badge")).toHaveText("Live");
  await waitForRequests(session.requests, beforeForeground + probeHosts.length);

  await page.getByRole("button", { name: "Pause" }).click();
  const stoppedAt = session.requests.length;
  await page.evaluate(() => (window as ProbeWindow).__pingSetHidden?.(true));
  await page.evaluate(() => (window as ProbeWindow).__pingSetHidden?.(false));
  await page.waitForTimeout(1_200);
  expect(session.requests).toHaveLength(stoppedAt);
});
