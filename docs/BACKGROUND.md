# Background measurements

Ping can keep requesting probes after its tab is hidden, but a website cannot guarantee a fixed sampling interval in the background. Browsers throttle timers to save power; Chrome can reduce chained timers to one wake-up per minute after a tab has been hidden for five minutes. On mobile, a browser may freeze or discard a page. When frozen, page timers and fetch callbacks stop running until the browser resumes the page, if it does at all.

The smallest honest implementation is to keep the existing per-probe timeout loops alive while hidden and treat them as best effort. Keep sampling independent of `document.hidden`; on each transition back to visible, increment a resume epoch used by the sampling effect. Its cleanup aborts the old controller and timers, and the new effect starts one fresh round immediately. Do not replay missed intervals: that would create a burst of requests and invented timestamps. Use each response's actual timestamp, so the history remains bounded and naturally shows gaps when the browser delayed or suspended sampling. A request that was still in flight at foreground return is aborted with the old effect and cannot be recorded as a fresh result. Responses delivered after the 4.5-second deadline are timeouts even if the browser delayed the timeout callback; they never become artificial multi-minute latency values.

A dedicated worker does not provide a browser-guaranteed background scheduler. It may keep JavaScript off the rendering thread, but browser lifecycle policies can still throttle or suspend background work. Service workers are event driven and cannot provide a continuous, precisely timed probe loop. Keeping audio or a real-time connection open to avoid throttling would waste user resources and would misrepresent the product.

The UI should distinguish `Background` from `Live`, while remaining clear that background sampling is best effort. A visible-to-hidden transition does not mean sampling has stopped; a frozen page cannot know that it was frozen until it resumes. If the browser later discards the page, no code in the page can continue measuring.

## Browser references

- [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) describes hidden-page throttling and browser timer budgets.
- [MDN: `setTimeout()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#timeouts_in_inactive_tabs) documents inactive-tab timer limits, including Chrome's intensive throttling and Firefox for Android's long timer floor or page unloading.
- [Chrome: Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) explains hidden, frozen, and discarded states. A frozen page suspends timers and fetch callbacks; a discarded page runs no code.
- [Chrome: Freezing on Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver) describes OS/browser initiated freezing for eligible background tabs.

## Local check

An automated Chromium run under Xvfb and the connected DevTools browser did not expose a reproducible hidden-tab state: `document.visibilityState` remained `visible` on all opened pages. The browser documentation defines the limits above; no claim about a hidden-tab cadence is based on that local run.
