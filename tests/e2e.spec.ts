import { expect, test, type Page } from "@playwright/test";

const probeHosts = new Set([
  "speed.cloudflare.com",
  "www.gstatic.com",
  "github.com",
  "www.bing.com",
  "www.baidu.com",
  "www.bilibili.com",
  "res.wx.qq.com",
  "www.taobao.com",
]);
const corsHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};
type Scenario = "normal" | "cloudflare-error" | "outlier";
type MockSession = {
  requests: string[];
  setScenario: (scenario: Scenario) => void;
};
type ProbeWindow = Window & {
  __probeAbortCount?: number;
  __probeActive?: Record<string, number>;
  __probeMaxActive?: Record<string, number>;
};

async function mockNetwork(
  page: Page,
  responseDelayMs = 60,
): Promise<MockSession> {
  const requests: string[] = [];
  let scenario: Scenario = "normal";
  await page.addInitScript(() => {
    const hosts = [
      "speed.cloudflare.com",
      "www.gstatic.com",
      "github.com",
      "www.bing.com",
      "www.baidu.com",
      "www.bilibili.com",
      "res.wx.qq.com",
      "www.taobao.com",
    ];
    const state = window as ProbeWindow;
    state.__probeAbortCount = 0;
    state.__probeActive = {};
    state.__probeMaxActive = {};
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input instanceof Request ? input.url : String(input);
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
        host = new URL(rawUrl).hostname;
        if (!hosts.includes(host)) host = undefined;
        if (host) {
          const count = (state.__probeActive[host] ?? 0) + 1;
          state.__probeActive[host] = count;
          state.__probeMaxActive![host] = Math.max(
            state.__probeMaxActive![host] ?? 0,
            count,
          );
          active = true;
          init?.signal?.addEventListener(
            "abort",
            () => {
              state.__probeAbortCount = (state.__probeAbortCount ?? 0) + 1;
              finish();
            },
            { once: true },
          );
        }
      } catch {
        /* Let fetch report malformed input. */
      }
      return originalFetch(input, init).finally(finish);
    };
  });
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (probeHosts.has(host)) requests.push(request.url());
  });
  await page.route("https://**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "one.one.one.one") {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "text/plain" },
        body: "ip=2001:db8::1234:abcd\nloc=SG\ncolo=SIN\ntls=TLSv1.3\nwarp=off\n",
      });
      return;
    }
    if (probeHosts.has(url.hostname)) {
      const delayed = scenario === "outlier" ? 1_500 : responseDelayMs;
      await new Promise((resolve) => setTimeout(resolve, delayed));
      try {
        await route.fulfill({
          status:
            scenario === "cloudflare-error" &&
            url.hostname === "speed.cloudflare.com"
              ? 503
              : 200,
          headers: {
            ...corsHeaders,
            "content-type": "application/octet-stream",
          },
          body: "",
        });
      } catch {
        /* Aborted probes can race the mocked response. */
      }
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });
  return {
    requests,
    setScenario: (next) => {
      scenario = next;
    },
  };
}

async function installClock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-31T00:00:00.000Z") });
}

async function waitForRequestCount(requests: string[], count: number) {
  await expect
    .poll(() => requests.length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(count);
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return [x, y, width, height].map((value) => Math.round(value * 10) / 10);
    };
    return {
      app: rect(document.querySelector(".app-shell")!),
      summary: rect(document.querySelector(".summary")!),
      histogram: rect(document.querySelector(".histogram")!),
      probes: [...document.querySelectorAll(".probe-card")].map(rect),
      regions: [...document.querySelectorAll(".region-panel")].map(rect),
      bins: [...document.querySelectorAll(".histogram-bin")].map((element) => {
        const { x, width } = element.getBoundingClientRect();
        return [Math.round(x * 10) / 10, Math.round(width * 10) / 10];
      }),
    };
  });
}

async function clickMoreAction(page: Page, name: string) {
  await page.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("dialog", { name: "More options" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name }).click();
}

test("shows exactly four fixed probe cards in each region and updates the selected summary", async ({
  page,
}) => {
  const session = await mockNetwork(page);
  await page.goto("/");
  const cards = page.locator(".probe-card");
  await expect(cards).toHaveCount(8);
  await expect(
    page.locator('.region-panel[data-region="cn"] .probe-card'),
  ).toHaveCount(4);
  await expect(
    page.locator('.region-panel[data-region="global"] .probe-card'),
  ).toHaveCount(4);
  await expect(page.locator(".summary .metric-value")).toHaveCount(4);
  await expect(page.locator(".summary-target")).toContainText("Cloudflare");
  await page
    .locator(".probe-card")
    .filter({ has: page.locator('.probe-name:text-is("Google")') })
    .click();
  await expect(page.locator(".summary-target")).toContainText("Google");
  await expect
    .poll(() => session.requests.length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(8);
});

test("polls all eight endpoints, pauses and resumes, and keeps one request active per target", async ({
  page,
}) => {
  await installClock(page);
  const { requests } = await mockNetwork(page, 80);
  await page.goto("/");
  await waitForRequestCount(requests, 8);
  await page.clock.runFor(6_000);
  await waitForRequestCount(requests, 16);
  const maxInFlight = await page.evaluate(() =>
    Math.max(...Object.values((window as ProbeWindow).__probeMaxActive ?? {})),
  );
  expect(maxInFlight).toBe(1);

  await page.getByRole("button", { name: "Pause" }).click();
  const stoppedAt = requests.length;
  await page.clock.runFor(20_000);
  expect(requests).toHaveLength(stoppedAt);
  await page.getByRole("button", { name: "Resume" }).click();
  await waitForRequestCount(requests, stoppedAt + 8);
});

test("retains sixty samples for all eight targets and exports that bounded history", async ({
  page,
}) => {
  await installClock(page);
  const { requests } = await mockNetwork(page);
  await page.goto("/");
  await page.getByLabel("Sampling interval").selectOption("3");
  await waitForRequestCount(requests, 16);
  let expected = requests.length;
  for (let cycle = 0; cycle < 63; cycle += 1) {
    expected += 8;
    await page.clock.fastForward(3_100);
    await waitForRequestCount(requests, expected);
  }
  await expect(page.locator(".probe-value")).toHaveCount(8);
  const downloadPromise = page.waitForEvent("download");
  await clickMoreAction(page, "Export data");
  const stream = await (await downloadPromise).createReadStream();
  if (!stream) throw new Error("Export stream unavailable");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    targets: Array<{ samples: unknown[] }>;
  };
  expect(payload.targets).toHaveLength(8);
  expect(payload.targets.every((target) => target.samples.length === 60)).toBe(
    true,
  );
});

test("aborts active probes and stays stopped in hidden and offline states", async ({
  page,
}) => {
  const { requests } = await mockNetwork(page, 350);
  await page.goto("/");
  await waitForRequestCount(requests, 8);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".status-badge")).toContainText(
    /hidden|background/i,
  );
  await expect
    .poll(
      () => page.evaluate(() => (window as ProbeWindow).__probeAbortCount ?? 0),
      { timeout: 2_000 },
    )
    .toBeGreaterThanOrEqual(8);
  const hiddenAt = requests.length;
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(requests).toHaveLength(hiddenAt);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await waitForRequestCount(requests, hiddenAt + 8);
  await page.context().setOffline(true);
  await expect(page.locator(".status-badge")).toContainText(/offline/i);
  await expect
    .poll(
      () => page.evaluate(() => (window as ProbeWindow).__probeAbortCount ?? 0),
      { timeout: 2_000 },
    )
    .toBeGreaterThanOrEqual(16);
  const offlineAt = requests.length;
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(requests).toHaveLength(offlineAt);
});

test("language, menu actions and IP reveal fit fixed interface and keep IP out of export", async ({
  page,
}) => {
  await mockNetwork(page);
  await page.goto("/");
  await expect(page.locator(".connection-strip .ip-value")).not.toContainText(
    "2001:db8",
  );
  await page.getByRole("button", { name: "Show IP" }).click();
  await expect(page.locator(".connection-strip .ip-value")).toContainText(
    "2001:db8::1234:abcd",
  );
  const beforeLanguage = await layout(page);
  await page.getByRole("button", { name: /Language|语言/ }).click();
  await expect(page.locator("h1")).toHaveText("网络状态");
  await expect(page.locator(".connection-strip .ip-value")).toContainText(
    "2001:db8::1234:abcd",
  );
  expect(await layout(page)).toEqual(beforeLanguage);
  await page.getByRole("button", { name: /Language|语言/ }).click();
  await expect(page.locator("h1")).toHaveText("Network status");
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Network status");
  await page.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("dialog", { name: "More options" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Export data" })).toBeVisible();
  await expect(
    menu.getByRole("button", { name: "Clear history" }),
  ).toBeVisible();
  await menu.getByRole("button", { name: "Close menu" }).click();

  await page.getByRole("button", { name: "Show IP" }).click();
  const downloadPromise = page.waitForEvent("download");
  await clickMoreAction(page, "Export data");
  const stream = await (await downloadPromise).createReadStream();
  if (!stream) throw new Error("Export stream unavailable");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString("utf8")).not.toContain(
    "2001:db8::1234:abcd",
  );
});

test("keeps fixed bounds across empty, normal, outlier, failure, reveal and language updates", async ({
  page,
}) => {
  const session = await mockNetwork(page);
  await page.goto("/");
  const cards = page.locator(".probe-card");
  await expect(cards).toHaveCount(8);
  const empty = await layout(page);
  await waitForRequestCount(session.requests, 8);
  await page.getByLabel("Sampling interval").selectOption("3");
  await page.clock.fastForward(3_100);
  const normal = await layout(page);
  expect(normal.app).toEqual(empty.app);
  expect(normal.summary).toEqual(empty.summary);
  expect(normal.histogram).toEqual(empty.histogram);
  expect(normal.probes).toEqual(empty.probes);
  expect(normal.regions).toEqual(empty.regions);
  expect(normal.bins.map((bin) => bin.slice(0, 2))).toEqual(
    empty.bins.map((bin) => bin.slice(0, 2)),
  );

  session.setScenario("outlier");
  await page.clock.fastForward(3_100);
  await expect
    .poll(
      async () => {
        const values = await page.locator(".probe-value").allTextContents();
        return Math.max(
          ...values.map(
            (value) => Number.parseFloat(value.replace(/[^\d.]/g, "")) || 0,
          ),
        );
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThan(1_000);
  const outlier = await layout(page);
  expect(outlier.app).toEqual(empty.app);
  expect(outlier.summary).toEqual(empty.summary);
  expect(outlier.histogram).toEqual(empty.histogram);
  expect(outlier.probes).toEqual(empty.probes);
  expect(outlier.bins.map((bin) => bin.slice(0, 2))).toEqual(
    empty.bins.map((bin) => bin.slice(0, 2)),
  );

  session.setScenario("cloudflare-error");
  await page.clock.fastForward(3_100);
  await expect(
    page
      .locator(".probe-card")
      .filter({ has: page.locator('.probe-name:text-is("Cloudflare")') }),
  ).toContainText(/failed|error/i);
  const failed = await layout(page);
  expect(failed.app).toEqual(empty.app);
  expect(failed.summary).toEqual(empty.summary);
  expect(failed.histogram).toEqual(empty.histogram);
  expect(failed.probes).toEqual(empty.probes);
  expect(failed.regions).toEqual(empty.regions);
});

test("fits a single viewport and keeps three self-hosted font families across devices and languages", async ({
  page,
}) => {
  await mockNetwork(page);
  await page.goto("/");
  await expect(page.locator(".probe-card")).toHaveCount(8);
  await expect(page.locator("main p")).toHaveCount(0);
  const dimensions = () =>
    page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
  const breakpoints = [
    [320, 568],
    [375, 667],
    [390, 844],
    [768, 1024],
    [667, 375],
    [1280, 720],
    [1440, 900],
  ];
  for (const [width, height] of breakpoints) {
    await page.setViewportSize({ width, height });
    for (const language of ["en", "zh"] as const) {
      const current = await page.locator("h1").innerText();
      const expected = language === "en" ? "Network status" : "网络状态";
      if (current !== expected)
        await page.getByRole("button", { name: /Language|语言/ }).click();
      const size = await dimensions();
      expect(
        size.scrollWidth,
        `${width}x${height} ${language} horizontal`,
      ).toBeLessThanOrEqual(size.width + 1);
      expect(
        size.scrollHeight,
        `${width}x${height} ${language} vertical`,
      ).toBeLessThanOrEqual(size.height + 1);
    }
  }
  const fontAudit = await page.evaluate(() => {
    const faces = new Set(
      [...document.fonts].map((font) => font.family.replaceAll('"', "").trim()),
    );
    const externalFonts = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\.(woff2?|ttf|otf)(\?|$)/i.test(name))
      .filter((name) => new URL(name).origin !== location.origin);
    return { faces: [...faces], externalFonts };
  });
  expect(fontAudit.faces).toHaveLength(3);
  expect(fontAudit.externalFonts).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const textNodes = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((element) =>
        [...element.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        ),
      )
      .map((element, index) => {
        element.setAttribute("data-font-audit", String(index));
        return index;
      }),
  );
  const renderedFonts = new Map<string, number>();
  for (const index of textNodes) {
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: `[data-font-audit="${index}"]`,
    });
    if (!nodeId) continue;
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    for (const font of fonts) {
      expect(
        font.isCustomFont,
        `unexpected system fallback: ${font.familyName}`,
      ).toBe(true);
      renderedFonts.set(
        font.familyName,
        (renderedFonts.get(font.familyName) ?? 0) + font.glyphCount,
      );
    }
  }
  expect([...renderedFonts.values()].every((glyphs) => glyphs > 0)).toBe(true);
  expect(renderedFonts.size).toBe(3);
  await cdp.detach();
  const smallTouchTargets = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "header button, .toolbar button, .toolbar select, .probe-card, .connection-strip button",
      ),
    ]
      .filter((element) => {
        const { width, height } = element.getBoundingClientRect();
        return width < 44 || height < 44;
      })
      .map((element) => ({
        label: element.textContent,
        rect: element.getBoundingClientRect().toJSON(),
      })),
  );
  expect(smallTouchTargets).toEqual([]);
});
