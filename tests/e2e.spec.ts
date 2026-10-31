import { expect, test, type Page } from "@playwright/test";

const probeHosts = new Set([
  "speed.cloudflare.com",
  "www.gstatic.com",
  "github.com",
  "www.baidu.com",
  "www.bilibili.com",
]);
const probeCorsHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};

type MockOptions = {
  delayMs?: number;
};

async function mockNetwork(page: Page, options: MockOptions = {}) {
  const requests: string[] = [];
  const activeByHost = new Map<string, number>();
  await page.addInitScript(() => {
    const targetHosts = [
      "speed.cloudflare.com",
      "www.gstatic.com",
      "github.com",
      "www.baidu.com",
      "www.bilibili.com",
    ];
    const state = window as Window & {
      __probeAbortCount?: number;
      __probeActive?: Record<string, number>;
      __probeMaxActive?: Record<string, number>;
    };
    state.__probeAbortCount = 0;
    state.__probeActive = {};
    state.__probeMaxActive = {};
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input instanceof Request ? input.url : String(input);
      let probeHost: string | undefined;
      let active = false;
      const finish = () => {
        if (probeHost && active) {
          state.__probeActive![probeHost] = Math.max(
            0,
            state.__probeActive![probeHost] - 1,
          );
          active = false;
        }
      };
      try {
        probeHost = new URL(rawUrl).hostname;
        if (targetHosts.includes(probeHost)) {
          const count = ((state.__probeActive ??= {})[probeHost] ?? 0) + 1;
          state.__probeActive[probeHost] = count;
          state.__probeMaxActive![probeHost] = Math.max(
            state.__probeMaxActive![probeHost] ?? 0,
            count,
          );
          active = true;
        } else {
          probeHost = undefined;
        }
        if (probeHost && init?.signal instanceof AbortSignal) {
          init.signal.addEventListener(
            "abort",
            () => {
              state.__probeAbortCount = (state.__probeAbortCount ?? 0) + 1;
              finish();
            },
            { once: true },
          );
        }
      } catch {
        // Ignore non-URL inputs; the real fetch still handles them.
      }
      return originalFetch(input, init).finally(finish);
    };
  });
  page.on("request", (request) => {
    try {
      const host = new URL(request.url()).hostname;
      if (probeHosts.has(host)) requests.push(request.url());
    } catch {
      // Ignore browser-internal requests.
    }
  });
  await page.route("https://**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "one.one.one.one") {
      await route.fulfill({
        status: 200,
        headers: { ...probeCorsHeaders, "content-type": "text/plain" },
        body: "ip=203.0.113.42\nloc=SG\ncolo=SIN\ntls=TLSv1.3\nwarp=off\n",
      });
      return;
    }
    if (probeHosts.has(url.hostname)) {
      const active = (activeByHost.get(url.hostname) ?? 0) + 1;
      activeByHost.set(url.hostname, active);
      options.onConcurrency?.(url.hostname, active);
      try {
        if (options.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.delayMs));
        }
        await route.fulfill({
          status: 200,
          headers: {
            ...probeCorsHeaders,
            "content-type": "application/octet-stream",
          },
          body: "",
        });
      } catch {
        // An expected cancellation can race with a delayed mock response.
      } finally {
        activeByHost.set(
          url.hostname,
          (activeByHost.get(url.hostname) ?? 1) - 1,
        );
      }
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });
  return requests;
}

async function installClock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-31T00:00:00.000Z") });
}

async function waitForRequestCount(requests: string[], count: number) {
  await expect
    .poll(() => requests.length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(count);
}

test("continues sampling, pauses, resumes, and clears the rolling window", async ({
  page,
}) => {
  await installClock(page);
  const requests = await mockNetwork(page, { delayMs: 80 });
  await page.goto("/");
  await waitForRequestCount(requests, 5);
  await page.clock.runFor(6_000);
  await waitForRequestCount(requests, 10);
  const maxPerTargetInFlight = await page.evaluate(() => {
    const maxActive = (
      window as Window & { __probeMaxActive?: Record<string, number> }
    ).__probeMaxActive;
    return Math.max(...Object.values(maxActive ?? {}));
  });
  expect(maxPerTargetInFlight).toBe(1);

  await page.getByRole("button", { name: "Pause" }).click();
  const pausedCount = requests.length;
  await page.clock.runFor(20_000);
  expect(requests).toHaveLength(pausedCount);

  await page.getByRole("button", { name: "Resume" }).click();
  await waitForRequestCount(requests, pausedCount + 5);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Clear history" }).click();
  await expect(page.locator(".bottom-note")).toContainText("0 requests");
  await page.getByRole("button", { name: "Resume" }).click();
  await waitForRequestCount(requests, pausedCount + 10);
});

test("caps every endpoint history at 60 samples", async ({ page }) => {
  await installClock(page);
  const requests = await mockNetwork(page);
  await page.goto("/");
  await page.getByLabel("Interval").selectOption("3");
  await waitForRequestCount(requests, 10);
  let expectedRequests = requests.length;
  // fastForward fires the scheduled sample timer without stepping through
  // every animation frame in the five sparklines.
  for (let cycle = 0; cycle < 63; cycle += 1) {
    expectedRequests += 5;
    await page.clock.fastForward(3_100);
    await waitForRequestCount(requests, expectedRequests);
  }
  await expect(page.locator(".bottom-note")).toContainText("300 requests", {
    timeout: 5_000,
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Export download stream unavailable");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
    targets: Array<{ samples: unknown[] }>;
  };
  expect(payload.targets).toHaveLength(5);
  expect(payload.targets.every((target) => target.samples.length === 60)).toBe(
    true,
  );
});

test("pauses in the background and aborts active probes when hidden or offline", async ({
  page,
}) => {
  const requests = await mockNetwork(page, { delayMs: 350 });
  await page.goto("/");
  await waitForRequestCount(requests, 5);
  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => value,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  await expect(page.locator(".live-badge")).toContainText(
    "Paused in background",
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as Window & { __probeAbortCount?: number })
              .__probeAbortCount ?? 0,
        ),
      { timeout: 2_000 },
    )
    .toBeGreaterThanOrEqual(5);
  const hiddenCalls = requests.length;
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(requests).toHaveLength(hiddenCalls);

  await setHidden(false);
  await waitForRequestCount(requests, hiddenCalls + 5);
  await page.context().setOffline(true);
  await expect(page.locator(".live-badge")).toContainText("Device offline");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as Window & { __probeAbortCount?: number })
              .__probeAbortCount ?? 0,
        ),
      { timeout: 2_000 },
    )
    .toBeGreaterThanOrEqual(10);
  const offlineCalls = requests.length;
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(requests).toHaveLength(offlineCalls);
});

test("language choice persists across reload and translates connection state", async ({
  page,
}) => {
  await mockNetwork(page);
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Your network. Now.");
  await page.getByRole("button", { name: "切换到中文" }).click();
  await expect(page.locator("h1")).toHaveText("网络，此刻。");
  await expect(page.locator(".visual-status")).toHaveText("在线");
  await page.reload();
  await expect(page.locator("h1")).toHaveText("网络，此刻。");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.locator("h1")).toHaveText("Your network. Now.");
  await expect(page.locator(".visual-status")).toHaveText("ONLINE");
});

test("exports samples without the revealed connection IP", async ({ page }) => {
  await mockNetwork(page);
  await page.goto("/");
  await expect(page.locator(".connection-details")).toContainText("SG");
  await expect(page.locator(".ip-box strong")).not.toHaveText("203.0.113.42");
  await page.getByRole("button", { name: "Show IP" }).click();
  await expect(page.locator(".ip-box strong")).toHaveText("203.0.113.42");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Export download stream unavailable");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const json = Buffer.concat(chunks).toString("utf8");
  expect(json).not.toContain("203.0.113.42");
  expect(JSON.parse(json)).not.toHaveProperty("connection");
});

test("fits desktop and 375px viewports in English and Chinese", async ({
  page,
}) => {
  await mockNetwork(page);
  await page.goto("/");
  const widths = () =>
    page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    let dimensions = await widths();
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);

    await page.getByRole("button", { name: "切换到中文" }).click();
    dimensions = await widths();
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    await page.getByRole("button", { name: "Switch to English" }).click();
  }
});
