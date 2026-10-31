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
const cloudflareHost = "one.one.one.one";
const ipinfoHost = "ipinfo.io";
const corsHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};
const testAddresses = {
  cloudflare: "2001:db8::1234:abcd",
  ipinfo: "203.0.113.27",
};

type Scenario = {
  outlierHost?: string;
  errorHost?: string;
};
type ProbeWindow = Window & {
  __probeActive?: Record<string, number>;
  __probeMaxActive?: Record<string, number>;
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

  await page.addInitScript(
    (hosts: string[]) => {
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
    },
    [...probeHosts],
  );

  page.on("request", (request) => requests.push(request.url()));
  await page.route("https://**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === cloudflareHost) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "text/plain" },
        body: "ip=2001:db8::1234:abcd\nloc=SG\ncolo=SIN\ntls=TLSv1.3\nwarp=off\n",
      });
      return;
    }
    if (url.hostname === ipinfoHost) {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          ip: testAddresses.ipinfo,
          hostname: "edge.example.net",
          city: "Singapore",
          region: "Singapore",
          country: "SG",
          loc: "1.3521,103.8198",
          org: "AS64500 Example Networks",
          timezone: "Asia/Singapore",
        }),
      });
      return;
    }
    if ((probeHosts as readonly string[]).includes(url.hostname)) {
      const currentScenario = scenario;
      const delay =
        currentScenario.outlierHost === url.hostname ? 1_350 : responseDelayMs;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await route.fulfill({
          status: currentScenario.errorHost === url.hostname ? 503 : 200,
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
    .poll(() => requests.length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(count);
}

async function waitForHostRequests(
  requests: string[],
  host: string,
  count: number,
) {
  await expect
    .poll(() => countHost(requests, host), { timeout: 5_000 })
    .toBeGreaterThanOrEqual(count);
}

async function waitForAllProbes(requests: string[]) {
  for (const host of probeHosts) {
    await waitForHostRequests(requests, host, 1);
  }
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
  await page.getByRole("button", { name: /more/i }).click();
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

test("shows eight English probes, two independent IP sources, and the ordered toolbar", async ({
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
  await expect
    .poll(async () => page.locator(".p95-value").first().innerText())
    .toMatch(/~/);
  for (const value of await page.locator(".p95-value").all()) {
    await expect(value).toHaveText(/~\s*\d/);
  }

  const toolbarControls = page.locator(".toolbar button, .toolbar select");
  await expect(toolbarControls).toHaveCount(3);
  await expect(toolbarControls.nth(0)).toHaveClass(/live-control/);
  await expect(toolbarControls.nth(0)).toHaveAttribute(
    "title",
    /Pause sampling/,
  );
  await expect(toolbarControls.nth(0).locator("svg")).toHaveCount(1);
  await expect(toolbarControls.nth(0).locator(".cadence")).toHaveText("3s");
  await expect(toolbarControls.nth(1)).toHaveAttribute("aria-label", "Theme");
  await expect(toolbarControls.nth(2)).toHaveAttribute(
    "aria-label",
    "More options",
  );
  expect(
    await toolbarControls
      .nth(1)
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      ),
  ).toEqual(["light", "dark", "gruvbox", "nord"]);
  await expect(page.locator(".plot-axis").first()).toHaveAttribute(
    "aria-label",
    "Fixed linear 0–1000 millisecond scale",
  );
  expect(
    (
      await page.locator(".plot-axis").first().locator("span").allTextContents()
    ).map((tick) => tick.trim()),
  ).toEqual(["0", "250", "500", "750", "1k ms"]);

  await expect(
    page.locator(".connection-panel article.connection-card"),
  ).toHaveCount(2);
  await expect(
    page.locator('.connection-card[data-provider="cloudflare"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.connection-card[data-provider="ipinfo"]'),
  ).toHaveCount(1);

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
  await expect(page.locator(".connection-card .exit-address")).toHaveCount(2);
  expect(
    (
      await page.locator(".connection-card .exit-address").allTextContents()
    ).join(" "),
  ).not.toMatch(
    new RegExp(`${testAddresses.cloudflare}|${testAddresses.ipinfo}`),
  );

  await waitForAllProbes(session.requests);
  await waitForHostRequests(session.requests, cloudflareHost, 1);
  await waitForHostRequests(session.requests, ipinfoHost, 1);
  expect(countHost(session.requests, cloudflareHost)).toBe(1);
  expect(countHost(session.requests, ipinfoHost)).toBe(1);
  for (const host of probeHosts) {
    expect(countHost(session.requests, host), host).toBeGreaterThanOrEqual(1);
  }
  const unexpectedHosts = [
    ...new Set(session.requests.map((url) => new URL(url).hostname)),
  ].filter(
    (host) =>
      ![
        ...probeHosts,
        cloudflareHost,
        ipinfoHost,
        "127.0.0.1",
        "localhost",
      ].includes(host),
  );
  expect(unexpectedHosts).toEqual([]);
  expect(countHost(session.requests, "www.gstatic.com")).toBe(0);

  await page.getByRole("button", { name: "More options" }).click();
  const options = page.getByRole("dialog", { name: "More options" });
  await expect(options).toBeVisible();
  await expect(options.getByLabel("History window")).toHaveCount(0);
  await expect(
    options.getByRole("button", { name: /plot scale/i }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  const ipCards = page.locator("article.connection-card");
  await expect(ipCards).toHaveCount(2);
  const magicIpCard = page.locator(
    'article.connection-card.magic-card[data-provider="ipinfo"]',
  );
  await expect(magicIpCard).toHaveCount(1);
  await expect(
    page.locator('.connection-card[data-provider="cloudflare"].magic-card'),
  ).toHaveCount(0);
  const glow = magicIpCard.locator(":scope > .magic-card-glow");
  await expect(glow).toHaveCount(1);
  await expect
    .poll(() => glow.evaluate((element) => getComputedStyle(element).position))
    .toBe("absolute");

  await page.getByRole("button", { name: "Show addresses" }).click();
  const cloudflareCard = page.locator(
    '.connection-card[data-provider="cloudflare"]',
  );
  const ipinfoCard = page.locator('.connection-card[data-provider="ipinfo"]');
  await expect(cloudflareCard.locator(".exit-address")).toContainText(
    testAddresses.cloudflare,
  );
  await expect(ipinfoCard.locator(".exit-address")).toContainText(
    testAddresses.ipinfo,
  );
  await expect(cloudflareCard.locator(".edge-value")).toContainText("SIN");
  await expect(cloudflareCard.locator(".tls-value")).toContainText("TLSv1.3");
  await expect(ipinfoCard.locator(".network-organization")).toContainText(
    "Example Networks",
  );
  await expect(ipinfoCard.locator(".network-asn")).toContainText("AS64500");
  await expect(ipinfoCard.locator(".network-location")).toContainText(
    "Singapore",
  );
  await expect(cloudflareCard.locator(".network-organization")).toHaveCount(0);
  await expect(ipinfoCard.locator(".edge-value")).toHaveCount(0);
  const beforeGlow = await geometry(page);
  await magicIpCard.hover();
  expect(await geometry(page)).toEqual(beforeGlow);

  await page.getByRole("button", { name: "Hide addresses" }).click();
  expect(
    (
      await page.locator(".connection-card .exit-address").allTextContents()
    ).join(" "),
  ).not.toMatch(
    new RegExp(`${testAddresses.cloudflare}|${testAddresses.ipinfo}`),
  );

  const beforeRefresh = {
    cloudflare: countHost(session.requests, cloudflareHost),
    ipinfo: countHost(session.requests, ipinfoHost),
  };
  await page
    .getByRole("button", { name: "Refresh connection info", exact: true })
    .click();
  await waitForHostRequests(
    session.requests,
    cloudflareHost,
    beforeRefresh.cloudflare + 1,
  );
  await waitForHostRequests(
    session.requests,
    ipinfoHost,
    beforeRefresh.ipinfo + 1,
  );
  expect(countHost(session.requests, cloudflareHost)).toBe(
    beforeRefresh.cloudflare + 1,
  );
  expect(countHost(session.requests, ipinfoHost)).toBe(
    beforeRefresh.ipinfo + 1,
  );
});

test("uses a three-second default and accepts validated fractional sampling intervals", async ({
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

test("keeps sampling beyond sixty attempts, bounds plotted marks, and exports bounded raw history", async ({
  page,
}) => {
  await installClock(page);
  const session = await mockNetwork(page);
  await page.goto("/");
  await waitForAllProbes(session.requests);
  const interval = 3;

  await advanceProbeCycles(page, session.requests, 72, interval);
  await expect(page.locator("article.probe-card")).toHaveCount(8);
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
    expect(
      await card.locator("circle.sample-point").count(),
    ).toBeLessThanOrEqual(120);
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

  const sessionTotal = parseCount(
    await page.locator(".session-total").innerText(),
  );
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
  expect(exported).not.toContain(testAddresses.cloudflare);
  expect(exported).not.toContain(testAddresses.ipinfo);
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
    expect(
      await cardFor(page, name).locator("circle.sample-point").count(),
    ).toBeLessThanOrEqual(120);
  }
});

test("keeps box plot and IP card geometry fixed through empty, outlier, and failed samples", async ({
  page,
}) => {
  await installClock(page);
  const session = await mockNetwork(page);
  await page.goto("/");
  await expect(page.locator("article.probe-card")).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
  const emptyGeometry = await geometry(page);
  await waitForAllProbes(session.requests);
  const interval = 3;
  await advanceProbeCycles(page, session.requests, 6, interval);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await expect(page.locator("rect.iqr-box")).toHaveCount(8);
  const populatedGeometry = await geometry(page);
  expect(populatedGeometry).toEqual(emptyGeometry);
  expect(
    await page.locator("svg.boxplot").first().getAttribute("data-scale"),
  ).toBe("1000");

  const cloudflare = cardFor(page, "Cloudflare");
  const outlierRequestCount = countHost(
    session.requests,
    "speed.cloudflare.com",
  );
  session.setScenario({ outlierHost: "speed.cloudflare.com" });
  await page.clock.fastForward(interval * 1_000 + 100);
  await waitForHostRequests(
    session.requests,
    "speed.cloudflare.com",
    outlierRequestCount + 1,
  );
  await expect
    .poll(async () => {
      const text = await cloudflare.locator(".probe-latest").innerText();
      return Number.parseFloat(text.replace(/[^\d.]/g, "")) || 0;
    })
    .toBeGreaterThan(1_000);
  await expect(
    cloudflare.locator("circle.sample-point.is-overflow").last(),
  ).toHaveAttribute("cx", /%$/);
  expect(
    Number.parseFloat(
      (await cloudflare
        .locator("circle.sample-point.is-overflow")
        .last()
        .getAttribute("cx")) ?? "NaN",
    ),
  ).toBeLessThanOrEqual(100);
  expect(
    await page.locator("svg.boxplot").first().getAttribute("data-scale"),
  ).toBe("1000");
  expect(await geometry(page)).toEqual(emptyGeometry);
  session.setScenario({});
  await page.getByRole("button", { name: "Pause" }).click();

  const errorRequestCount = countHost(session.requests, "speed.cloudflare.com");
  session.setScenario({ errorHost: "speed.cloudflare.com" });
  await page.getByRole("button", { name: "Resume" }).click();
  await waitForHostRequests(
    session.requests,
    "speed.cloudflare.com",
    errorRequestCount + 1,
  );
  await expect(cloudflare.locator(".probe-status")).toHaveAttribute(
    "aria-label",
    "Failed",
  );
  session.setScenario({});
  expect(await geometry(page)).toEqual(emptyGeometry);
});

test("keeps four themes, readable colors, three self-hosted fonts, and all content within common viewports", async ({
  page,
}) => {
  const session = await mockNetwork(page);
  await page.goto("/");
  await expect(page.locator("article.probe-card")).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Network status");
  await expect(
    page.getByRole("button", { name: /language|中文/i }),
  ).toHaveCount(0);
  await expect(page.locator("main p")).toHaveCount(0);

  const textAudit = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const loadedFamilies = new Set(
      [...document.fonts].map((font) => font.family.replaceAll('"', "").trim()),
    );
    const fontFiles = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\.(woff2?|ttf|otf)(\?|$)/i.test(name));
    const externalFonts = fontFiles.filter(
      (name) => new URL(name).origin !== location.origin,
    );
    return {
      hasCjk: /[\u3400-\u9fff]/.test(bodyText),
      loadedFamilies: [...loadedFamilies],
      fontFiles,
      externalFonts,
      lang: document.documentElement.lang,
    };
  });
  expect(textAudit.hasCjk).toBe(false);
  expect(textAudit.lang).toBe("en");
  expect(new Set(textAudit.loadedFamilies)).toEqual(
    new Set(["Inter", "JetBrains Mono", "Space Grotesk"]),
  );
  expect(textAudit.fontFiles.length).toBeGreaterThanOrEqual(3);
  expect(textAudit.externalFonts).toEqual([]);
  expect(
    session.requests.some((url) =>
      new URL(url).pathname.match(/\/(?:locales?|messages?)\/.*\.json$/i),
    ),
  ).toBe(false);

  const viewports = [
    [320, 568],
    [375, 667],
    [390, 844],
    [667, 375],
    [768, 1024],
    [1366, 768],
    [1440, 900],
  ];
  const themeSelect = page.getByLabel("Theme");
  const themes = ["light", "dark", "gruvbox", "nord"];
  await expect(themeSelect.locator("option")).toHaveCount(themes.length);

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    let referenceGeometry: Awaited<ReturnType<typeof geometry>> | undefined;
    for (const theme of themes) {
      await themeSelect.selectOption(theme);
      expect(await themeSelect.inputValue(), `${theme} selected`).toBe(theme);

      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        scrollWidth: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
        scrollHeight: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ),
        cards: document.querySelectorAll("article.probe-card").length,
        addresses: document.querySelectorAll(".connection-card .exit-address")
          .length,
        contentInViewport: [
          ...document.querySelectorAll(
            ".topbar, .connection-card, article.probe-card, footer",
          ),
        ].every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top >= -1 && rect.bottom <= window.innerHeight + 1;
        }),
        colors: (() => {
          const element = document.querySelector(".app-shell");
          if (!element) throw new Error("App shell is missing");
          const style = getComputedStyle(element);
          return Object.fromEntries(
            ["--ink", "--muted", "--danger", "--surface", "--canvas"].map(
              (token) => [token, style.getPropertyValue(token).trim()],
            ),
          ) as Record<string, string>;
        })(),
      }));
      expect(dimensions.cards, `${width}x${height} probe count`).toBe(8);
      expect(dimensions.addresses, `${width}x${height} IP count`).toBe(2);
      expect(
        dimensions.contentInViewport,
        `${width}x${height} content visibility in ${theme}`,
      ).toBe(true);
      expect(
        dimensions.scrollWidth,
        `${width}x${height} horizontal scroll in ${theme}`,
      ).toBeLessThanOrEqual(dimensions.width + 1);
      expect(
        dimensions.scrollHeight,
        `${width}x${height} vertical scroll in ${theme}`,
      ).toBeLessThanOrEqual(dimensions.height + 1);
      for (const foreground of ["--ink", "--muted", "--danger"]) {
        for (const background of ["--surface", "--canvas"]) {
          expect(
            contrastRatio(
              dimensions.colors[foreground],
              dimensions.colors[background],
            ),
            `${theme} ${foreground} on ${background} contrast`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }

      const currentGeometry = await geometry(page);
      if (referenceGeometry) {
        expect(
          currentGeometry,
          `${theme} layout at ${width}x${height}`,
        ).toEqual(referenceGeometry);
      } else {
        referenceGeometry = currentGeometry;
      }
    }
  }

  await themeSelect.selectOption("nord");
  await page.reload();
  await expect(page.getByLabel("Theme")).toHaveValue("nord");
});

test("pauses sampling, hides stale work, resumes, and clears retained history", async ({
  page,
}) => {
  await installClock(page);
  const session = await mockNetwork(page);
  await page.goto("/");
  await waitForAllProbes(session.requests);
  const interval = 3;
  await advanceProbeCycles(page, session.requests, 2, interval);

  await page.getByRole("button", { name: "Pause" }).click();
  const stoppedAt = session.requests.length;
  await page.clock.fastForward(20_000);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(session.requests).toHaveLength(stoppedAt);

  await page.getByRole("button", { name: "Resume" }).click();
  await page.clock.fastForward(interval * 1_000 + 100);
  await waitForRequests(session.requests, stoppedAt + 8);
  await expect
    .poll(async () =>
      parseCount(await page.locator(".session-total").innerText()),
    )
    .toBeGreaterThan(0);
  const totalBeforeClear = parseCount(
    await page.locator(".session-total").innerText(),
  );
  expect(totalBeforeClear).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause" }).click();
  await clickMoreAction(page, "Clear history");
  await expect(page.locator("circle.sample-point")).toHaveCount(0);
  expect(parseCount(await page.locator(".retained-total").innerText())).toBe(0);
  expect(parseCount(await page.locator(".session-total").innerText())).toBe(0);
});
