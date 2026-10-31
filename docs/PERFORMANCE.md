# Runtime performance

Measured in Chromium 156 with production builds, a 1440 × 1000 viewport and locally intercepted probe/IP requests. The immutable baseline is commit `6c65e76`. Each matched run used the same 25–95 ms varying probe-response delays, 4.5 s settling period and 12 s wall-clock measurement window. Seeding history, garbage collection and browser acceptance tests ran outside those windows.

`TaskDuration` measures renderer main-thread task time. It is not whole-process CPU usage, and these percentages cannot be directly compared with an operating-system CPU meter. Real network, DNS and TLS costs were not measured. Heap figures below are reachable JavaScript memory after forced GC, in decimal MB (bytes ÷ 1,000,000), excluding browser/GPU/font memory.

## Measured outcome

| Scenario | Baseline task | Updated task | Change | Baseline layout | Updated layout |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 s sampling, 40 records | 2.657 s | 0.730 s | −72.5% | 1.377 s | 0.187 s |
| 1 s sampling, 128 records | 3.881 s | 2.248 s | −42.1% | 1.644 s | 0.573 s |
| Paused after 1 s sampling | 1.616 s | 0.191 s | −88.2% | 0.838 s | 0.029 s |
| 3 s sampling, 1,200 records per probe | 4.995 s | 1.447 s | −71.0% | 1.831 s | 0.254 s |

The full-history runs started at 1,200 records per probe. Both versions reached 1,202 after settling and 1,206 after measurement, while each retained array stayed at 1,200. The lifetime count reached 9,648, confirming continued sampling beyond the internal buffer capacity. DOM elements were 2,416 before and 2,408 after during the active full-history runs.

| Post-GC memory snapshot | Baseline | Updated |
| --- | ---: | ---: |
| Empty history | 3.536 MB | 3.553 MB |
| 1,200 retained records × 8 probes | 5.507 MB | 5.470 MB |
| Full-history DOM elements | 2,414 | 2,406 |

Retained heap use is effectively unchanged; this is not evidence of a substantial memory reduction. Temporary per-record wrapper allocations were removed, and the existing history/point caps remain. Capacity snapshots do not establish the absence of every possible long-session leak.

## Findings and selected fixes

1. **Remove continuous number animation.** A separate 1 s / 12 s ablation kept all CSS effects but suppressed NumberTicker's per-frame `textContent` writes. Task time fell from 4.911 s to 3.087 s and layout time from 2.205 s to 0.722 s, while script time stayed near 0.68 s. Skipping only identical strings did not produce a clear task-time improvement. Readings now show each measured integer immediately; the unused ticker component was deleted. Point-arrival rings and send/receive activity remain.
2. **Reuse unchanged chart work.** Charts are memoized. New measurements render immediately; subtle age-opacity refreshes use five-second ticks. Each probe reuses its window summary until its sample array changes or a time boundary changes eligibility. Window expiry and clock rollback/future-record cases retain exact filtering semantics. A one-second footer clock no longer rebuilds all point subtrees.
3. **Avoid unnecessary allocations and sorting.** Chronological window filtering no longer constructs a wrapper object for every record or sorts already ordered streams. Sorting remains available after a clock adjustment produces out-of-order timestamps. Cache entries are bounded to one current window per probe.

The matched before/after numbers combine these changes; they do not isolate the gain from each selected fix. A readable production JS profile found work in `statistics`, `selectRecentHistory`, `ProbePlot` and Motion frame functions, but renderer/layout work was larger than the sampled pure-JS costs.

## Changes not selected

- Disabling all CSS animation alone only improved task time from about 4.911 s to 4.525 s in the ablation. The new-point and activity feedback was retained.
- Workers cannot remove DOM layout work from the renderer. The measured retained heap is already small, so no worker, typed-buffer storage engine, reduced history cap or reduced sampling frequency was introduced.
- MagicCard's pointer glow is interaction driven, rather than continuous probe work; it was retained. Total browser-process memory and real-network packet-processing costs remain outside this benchmark.

## Session artifacts

Temporary, session-local artifacts are in `/tmp/ping-perf-baseline-dist`, `/tmp/ping-prod-profile.mjs`, `/tmp/ping-prod-profile-names.mjs`, `/tmp/ping-memory-profile.mjs`, `/tmp/ping-perf-ablations.mjs`, `/tmp/ping-perf-ablation-full.mjs`, `/tmp/ping-before-after.mjs` and `/tmp/ping-fullhistory-ab.mjs`. These are diagnostic artifacts, not production instrumentation or permanent repository tooling. The full-history scripts seed React state only for the controlled benchmark; normal production data still comes solely from probes.

## Subsequent count-window simplification

The later 120-attempt window replaces the previously measured 1,200-record cap and 30-minute cutoff. Raw retention falls from 9,600 to 960 records across eight probes. The time-filter/expiry cache, FNV priorities, priority sort, recent-tail reservation and five-second opacity refresh were removed. Statistics sort at most 120 valid values; plotting is linear over at most 120 attempts. Retained-heap and CPU percentages above describe the earlier measured implementation, not a fresh benchmark of this change. SVG point capacity is unchanged, so rendering cost should not be expected to fall by the same 90% as raw retention.
