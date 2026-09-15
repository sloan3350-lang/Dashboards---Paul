# Kanon

Offline-first autoregulated training, body composition and recovery tracker.
Built for a 2x/week full-body program run in a fat-loss phase.

## Why it is not an RP clone

RP's engine drives **volume** from soreness and pump. Soreness declines as you
adapt to a movement (the repeated-bout effect), so a well-adapted lifter reports
low soreness and the algorithm reads that as "add sets." Pump is also a weak
proxy for stimulus. Meanwhile the hypertrophy dose-response curve flattens past
roughly 15-20 hard sets per muscle per week.

Kanon inverts it: **performance leads, feedback vetoes.**

| Signal | What it can do |
|---|---|
| Load / reps at a fixed RIR | Drives progression. The primary input. |
| Muscle engagement ("pump") | Flags a targeting problem. Never adds volume. |
| Recovery on arrival ("soreness") | Can only hold or cut. Never adds. |
| Joint pain | Overrides everything. Swaps the movement immediately. |

Volume only ever rises in response to a **stall** with good recovery, and in
fat-loss mode it does not rise at all, because recovery is the limiter there,
not stimulus.

## Joint triage

Every exercise is tagged with a per-joint stress profile. Flagging a joint at
severity 2 pulls the movement, quarantines it for 3 sessions, and substitutes a
pattern-equivalent lift with measurably lower load on *that specific joint* —
same slot, different vector. The quarantine expires and the lift comes back for
a retest rather than disappearing forever.

## Running it

It is a static site with no build step and no runtime dependencies.

    python3 -m http.server 8099     # then open http://localhost:8099

On a phone, open it and use Add to Home Screen. The service worker caches
everything, so it works in a gym with no signal. Data lives in `localStorage`
on that device only; export JSON from Settings to back it up.

## Tests

    node engine.test.js

31 assertions over load progression, volume decisions, joint substitution,
deloads, Navy body fat, protein targets and weight-trend reliability.

## Not medical advice

The joint swap is a programming decision, not a diagnosis. Body-fat and
hydration figures are estimates for healthy adults. Nothing here addresses
medication.
