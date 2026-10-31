# Rolling sample history

Each probe retains its latest **120 completed attempts**, including failures. A new attempt immediately replaces the oldest one at capacity. Statistics, box plots, dynamic axis bounds and JSON exports use this same window; no separate archive or time-based cutoff remains. The first request per probe is warm-up and never enters the window. Lifetime counters continue beyond 120.

At the default 3-second interval the window covers roughly six minutes; at 1 second, roughly two minutes. Timeouts can make the actual duration longer. Pausing preserves the current 120 attempts rather than expiring them by elapsed time.

Failures occupy a window position but do not become latency dots or percentile inputs. They break jitter adjacency. After 120 consecutive failures, the latency distribution is empty, rather than retaining old successes indefinitely. Percentiles and Tukey whiskers use every valid reading in the window.

All valid window points are drawn, with no priority sampling, extrema reservation or chronological re-sorting. Stable keys and timestamp-derived vertical lanes preserve retained point identity. Coincident records share one drawn mark while remaining separate statistics records. New valid measurements receive the existing one-shot 900 ms ring; reduced-motion behavior remains.

Point opacity follows attempt age: `0.12 + 0.88 × 2^(−age / 30)`, where the latest attempt has age zero. A valid point is 100% opaque when new, about 56% after 30 newer attempts, 34% after 60, and 18% at the oldest edge. Failures also advance this aging. No fading timer is needed; pausing stops the rank from changing.

Across eight probes at most 960 raw records remain. Plot and summary work is memoized by each immutable sample array; footer-clock updates do not rebuild charts. Closing/refreshing clears session data. JSON export version 6 records `windowSamples: 120` and `retentionLimit: 120`, without connection addresses or a time-window field.

Each region still shares dynamic linear bounds: lowest valid reading rounded down to 50 ms, highest per-probe P95 rounded up to 50 ms, minimum span 50 ms. Axis changes reproject existing values correctly without resizing the plot frame.
