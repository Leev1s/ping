# Continuous sample history

Each probe keeps its latest **1,200 attempts** in memory. At a five-second
interval that is about 100 minutes; at three seconds it is about 60 minutes.
The same fixed cap applies during failures, because a failed attempt is still a
useful history event. New samples replace the oldest entry after the cap, so
sampling does not stop and memory does not grow with session length. Eight
probes retain at most 9,600 small records. Actual JavaScript object size varies
by browser, but each record contains only a timestamp, latency, outcome, and an
optional verification label.

The selected chart window is time-based. Statistics use every sample within
that window, while the scatter drawing is limited to 120 marks per probe. When
the window contains more marks, evenly spaced chronological samples are drawn
from its fixed endpoints. The first and latest timestamps and observed
minimum/maximum latency are retained when the point cap permits. Each mark's
opacity uses its timestamp's real age in the selected window (newest 1.0,
oldest 0.16), rather than its position in the array. Failed attempts stay in retained history and failure counters. They do not become fabricated latency dots; error-response latency is excluded from latency percentiles and the box plot.

This is session history only: it is not copied to local storage or sent to a
server. Closing or refreshing the page clears it. That avoids an unbounded
persistent log and keeps the measured data on the user's device. Manual JSON export includes the retained samples and lifetime counters but no IP details. Persistence is intentionally absent.

## Memory rationale

The retained object count is bounded by `8 × 1,200`, independent of how long
the page remains open. The implementation returns a fresh, capped array for
React updates; after each update the prior array can be garbage-collected once
no render references it. Browser JavaScript engines reclaim objects when they
are no longer reachable, so old records must be removed from strong references
to make them collectible. The history module does not use Resource Timing
entries or increase the browser's separate resource-timing buffer.

Sources: [MDN JavaScript memory management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Memory_management),
[MDN Performance data](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Performance_data),
[MDN Resource Timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing).

## Acceptance checks

- After 100,000 appends, one probe still retains exactly 1,200 records and the
  newest attempt; the oldest retained record advances as new attempts arrive.
- At all times the in-memory history across eight probes is at most 9,600
  records; no session duration increases that bound.
- A selected time window excludes older and future-dated samples and retains
  failures for status rendering.
- Statistics read every eligible attempt in the selected window; a chart gets
  no more than 120 marks per probe and keeps its first/latest eligible samples
  plus latency extrema when the point limit permits.
- Mark opacity increases with recency according to elapsed time. An evicted
  sample disappears without resizing the chart or changing its fixed axes.
