# Repository audit

Audited 11 October 2026, starting at `7d74bc0`.

## Baseline

- Vite 8, React 19, TypeScript 6; static SPA with custom hash challenge URLs. TypeScript strict mode was absent.
- `src/components` contains screens, shared board/keyboard, modals; `src/hooks` owns game/input/storage/toasts; `src/utils` owns evaluation, codec, sharing, stats; `src/data` contains 2,315 answers and 14,855 valid guesses. No backend.
- Scripts: dev, build, preview and oxlint lint. Missing typecheck, CI test, format tooling, CI, deployment configuration and environment example.
- `npm install`: passed, zero vulnerabilities. Dev server: passed. Build: passed (main JS 360.85 kB / 125.58 kB gzip). Lint: passed with React set-state-in-effect warning in App. Existing standalone tests: 13 passed; no npm test script.
- Browser baseline exercised solo, setter, share link and challenge flow at 360×740 and 1280×900. Automated browser tooling was installed for this work.

## Issues and disposition

| Area | Finding | Resolution phase |
| --- | --- | --- |
| Touch input | Keys invoke both pointerdown and click, duplicating letters/backspace | 1 |
| Game input | State ref only updated after render; fast Enter can submit twice | 1 |
| Persistence | Unlimited answer replaced on refresh; answer-specific saves orphaned; restored final flips treated as playing | 1 |
| Persistence | Saved games, settings and stats trusted without schema validation; direct help/reset storage calls can throw | 1 |
| Stats | 2-Player outcomes explicitly excluded; no durable finished-game deduplication | 1 |
| Timers | Reveal, bounce, persistence, toast, setter, clipboard and result timers leak across navigation | 1 |
| Input | Physical keyboard also processes focused inputs and open modals; setter duplicates listener | 1 |
| Modals | Escape exists but focus trap/restoration does not; delayed focus timer leaks | 1 |
| Toasts | Timers recreated for existing toasts on queue size change; stale visual items | 1 |
| Hard mode | Known duplicate letters require counts, not only includes() | 1 |
| Codec | Decoded payloads accept words outside dictionary; no checksum/canonical validation; malformed links silently go home | 1 |
| Routing | Challenge hash removed on load, breaking refresh; no hashchange routing; error screen unreachable | 1 |
| Challenge copy | UI says 8-character codes although codec generates 4; clipboard fallback ignores failure | 1 |
| Header | Stats/settings do nothing outside game; narrow header overlaps controls | 1 |
| Mobile | Keyboard exceeds narrow viewport; fixed board height clips; safe-area and overscroll handling missing | 1 |
| A11y | Key labels omit state; several foreground colors fail contrast; focused controls not consistently visible | 1 |
| Tooling | Strict typing, ESLint/Prettier, standard tests, environment ignores missing | 1 |
| Cleanup | Unused Vite/React starter styles and assets; inaccurate README | 1, 4 |
| Duel | No realtime room, synchronized clock, seeded sequence, progress, ranking, presence or rematch | 2 |
| Tests | Standalone assertions omit React, regression, room and security-rule coverage | 3 |
| Hosting | No Vercel config, Node pin, PWA icons/manifest or realtime setup guide | 4 |

The existing two-pass evaluation, key-state priority and ordinal strings were already correct. Regression coverage will preserve them. Firebase remains the production backend; mock rooms use browser storage and BroadcastChannel and are local to one origin/browser profile. Deployment is explicitly out of scope.

## Final verification

Updated in Phase 5 with final checks, browser coverage, sizes and remaining limitations.
