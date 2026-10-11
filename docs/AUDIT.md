# Repository audit

Audited 11 October 2026, starting at `7d74bc0`.

## Baseline

- Vite 8, React 19, TypeScript 6; static SPA with custom hash challenge URLs. TypeScript strict mode was absent.
- `src/components` contains screens, shared board/keyboard, modals; `src/hooks` owns game/input/storage/toasts; `src/utils` owns evaluation, codec, sharing, stats; `src/data` contains 2,315 answers and 14,855 valid guesses. No backend.
- Scripts: dev, build, preview and oxlint lint. Missing typecheck, CI test, format tooling, CI, deployment configuration and environment example.
- `npm install`: passed, zero vulnerabilities. Dev server: passed. Build: passed (main JS 360.85 kB / 125.58 kB gzip). Lint: passed with React set-state-in-effect warning in App. Existing standalone tests: 13 passed; no npm test script.
- The initial 360×740 browser run exposed missing hashchange challenge navigation. Full flows and desktop layout were subsequently verified after the fixes; the baseline browser audit did not complete every desktop flow before edits. Automated browser tooling was installed for this work.

## Issues and disposition

| Area           | Finding                                                                                                              | Resolution phase |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Touch input    | Keys invoke both pointerdown and click, duplicating letters/backspace                                                | 1                |
| Game input     | State ref only updated after render; fast Enter can submit twice                                                     | 1                |
| Persistence    | Unlimited answer replaced on refresh; answer-specific saves orphaned; restored final flips treated as playing        | 1                |
| Persistence    | Saved games, settings and stats trusted without schema validation; direct help/reset storage calls can throw         | 1                |
| Stats          | 2-Player outcomes explicitly excluded; no durable finished-game deduplication                                        | 1                |
| Timers         | Reveal, bounce, persistence, toast, setter, clipboard and result timers leak across navigation                       | 1                |
| Input          | Physical keyboard also processes focused inputs and open modals; setter duplicates listener                          | 1                |
| Modals         | Escape exists but focus trap/restoration does not; delayed focus timer leaks                                         | 1                |
| Toasts         | Timers recreated for existing toasts on queue size change; stale visual items                                        | 1                |
| Hard mode      | Known duplicate letters require counts, not only includes()                                                          | 1                |
| Codec          | Decoded payloads accept words outside dictionary; no checksum/canonical validation; malformed links silently go home | 1                |
| Routing        | Challenge hash removed on load, breaking refresh; no hashchange routing; error screen unreachable                    | 1                |
| Challenge copy | UI says 8-character codes although codec generates 4; clipboard fallback ignores failure                             | 1                |
| Header         | Stats/settings do nothing outside game; narrow header overlaps controls                                              | 1                |
| Mobile         | Keyboard exceeds narrow viewport; fixed board height clips; safe-area and overscroll handling missing                | 1                |
| A11y           | Key labels omit state; several foreground colors fail contrast; focused controls not consistently visible            | 1                |
| Tooling        | Strict typing, ESLint/Prettier, standard tests, environment ignores missing                                          | 1                |
| Cleanup        | Unused Vite/React starter styles and assets; inaccurate README                                                       | 1, 4             |
| Duel           | No realtime room, synchronized clock, seeded sequence, progress, ranking, presence or rematch                        | 2                |
| Tests          | Standalone assertions omit React, regression, room and security-rule coverage                                        | 3                |
| Hosting        | No Vercel config, Node pin, PWA icons/manifest or realtime setup guide                                               | 4                |

The existing two-pass evaluation, key-state priority and ordinal strings were already correct. Regression coverage will preserve them. Firebase remains the production backend; mock rooms use browser storage and BroadcastChannel and are local to one origin/browser profile. Deployment is explicitly out of scope.

## Final verification

All listed implementation issues have been addressed. The original grading table was kept unchanged. Final review also reproduced and fixed duplicate anonymous sign-in during overlapping StrictMode startup; concurrent clients now share one lazy SDK/identity initialization, with retry after failure.

- Strict lint/typecheck/build pass. Vitest: **122 tests** across eight files, including all 14,855 codec round trips, duplicate evaluation, StrictMode stats/input, storage corruption, route restoration, PRNG/ranking symmetry, and room lifecycle.
- Firebase emulator: **10 tests** pass, including actual transport create/join/ready/full countdown/play/finish/rematch plus ownership, no enumeration, capacity, malformed fields, timing, refresh, forfeit and cleanup.
- Browser: existing modes checked at **320×740, 360×740 and 1280×900**; real two-tab one-minute match, same sequence/result/reason, live grids, refresh, rematch, all three duration rooms, third-player rejection, lobby cleanup, countdown abort, reconnect and 20-second forfeit. No application console errors/page errors observed.
- Production preview receives a separate smoke test; mock production preview exercises complete browser flows. Missing Firebase production configuration displays the friendly setup message.
- Production main JavaScript: approximately **372 kB / 130 kB gzip** (baseline 361 kB / 126 kB). Duel UI approximately **36 kB / 12 kB gzip**; Firebase Auth/Database/App are separate dynamic chunks and are not requested during solo play. Font CSS uses `display=swap`; there is no service worker.
- `npm audit`: zero vulnerabilities after targeted dependency overrides, including deduplication of Firebase App/App Compat required for SDK component registration.
- Environment placeholders and env reads only; no Firebase credentials, private keys, deployment artifacts or logs tracked. No deployment or Vercel CLI command was run.

## Design choices and limits

Firebase remains the production recommendation. Readiness and rematch votes live on each player's node rather than host-owned metadata; current-seed votes and explicit host/guest seats enforce ownership and capacity. Duration changes increment the seed to invalidate both ready flags without changing the guest's data. Firebase anonymous Auth uses per-tab session persistence so two tabs can be independent players while reload preserves the UID. Mock abandoned-tab presence uses a heartbeat grace before the 20-second forfeit clock; normal refresh returns earlier.

At the buzzer, offline results remain provisional until queued pre-buzzer progress settles; sharing/rematch/stats receipts wait for confirmed final snapshots. This protects exact-once statistics from transient outcomes. Actual anonymous sign-in and cross-device Firebase play cannot be verified without the owner's project; emulator tests inject authenticated clients. The owner must complete `docs/SETUP_REALTIME.md`. Seed derivation/own-score forgery remains possible by design for friendly play. Rooms whose hosts never return require optional trusted six-hour cleanup, documented in that guide.

Small optional scoring suggestion, not implemented: if the game later becomes competitive, consider comparing precision-adjusted server timestamps for the final-solve tie-breaker. The requested policy and client clock correction remain unchanged.
