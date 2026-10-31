# Continuous sample history

Each probe keeps its latest **1,200 attempts** in page memory, including failures. At the default 3-second interval this is about 60 minutes of attempts; at 1 second it is about 20 minutes. The effective chart and statistics window is fixed at the trailing **30 minutes**. At intervals faster than the cap can cover, the page uses the available retained portion of that window. New attempts replace the oldest record for that probe after the cap, so sampling does not stop and memory does not grow with session length. Eight probes retain at most 9,600 records. JavaScript object size varies by browser; each record contains a timestamp, latency or null, outcome, and optional verification label.

Statistics use every eligible sample retained inside the fixed 30-minute window. Each probe's scatter plot draws at most **120 valid marks**. When the window has more points, the drawing selects evenly spaced chronological samples while preserving the endpoints and observed minimum/maximum latency when the point budget permits. This drawing limit does not change statistics. Each mark's opacity uses its actual age in the window (newest 1.0, oldest 0.16), rather than its position in the array. Failed attempts remain in retained history and counters but do not become latency dots. Error-response latency is excluded from percentiles and the box plot.

The 1,200-attempt cap is independent of session duration and sample rate. Its approximate time coverage is `1,200 × interval` seconds, while the visible analysis window remains 30 minutes. Session totals and failure counters continue to increase after samples start being evicted.

This is session history only: samples are not copied to local storage or sent to a server. Closing or refreshing the page clears them. The theme and interval preferences are stored locally, separately from measurement history. Manual JSON export includes retained samples and session counters but no IP details. Clearing history resets the session counters and starts a new measurement session.

The plot keeps a fixed physical frame while its linear range adapts independently
for China and International. Each range uses the largest of that group's four
per-probe P95 values, adds 20% headroom, and rounds up to a nice tick; it has a
50 ms minimum and starts at 100 ms before valid readings. Three tick labels show
0, midpoint, and right bound.

When hidden, sampling continues on a best-effort basis; browsers can throttle or
suspend timers. On return, Ping starts a fresh round immediately and does not
replay missed intervals.

## Memory rationale

The retained object count is bounded by `8 × 1,200`, regardless of how long the page stays open. Each update returns a fresh capped array; the previous array can be collected after no render references it. Browser JavaScript engines reclaim unreachable objects, so evicted records must no longer be held by strong references. The history module does not use Resource Timing entries or increase the browser's separate resource-timing buffer.

Sources: [MDN JavaScript memory management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management), [MDN Performance data](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Performance_data), and [MDN Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing).

## Acceptance checks

- After 100,000 appends, one probe still retains exactly 1,200 attempts and the newest attempt; the oldest retained record advances as samples arrive.
- Across eight probes, in-memory history never exceeds 9,600 records, regardless of session duration.
- The fixed trailing 30-minute view excludes older and future-dated samples while retaining failed attempts for status and counters.
- Statistics read every eligible retained sample in the window; each plot draws no more than 120 valid marks and preserves endpoints and latency extrema when the point limit permits.
- Point opacity reflects elapsed age. Eviction removes old records and dynamic range changes without resizing the plot frame.
