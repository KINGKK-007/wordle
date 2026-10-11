# Final verification — 11 October 2026

Prepared for GitHub release on `feat/duel-mode` and `main`. No deployment was performed.

| Check                  | Result                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run lint`         | Passed, zero warnings                                                                                  |
| `npm run typecheck`    | Passed, strict app/config/test typing                                                                  |
| `npm run test`         | 122 passed across eight files                                                                          |
| `npm run test:rules`   | 10 passed against the local Firebase database emulator                                                 |
| `npm run build`        | Passed; static `dist/`, Firebase split into lazy chunks                                                |
| `npm run preview`      | Passed; production smoke test and all static assets returned 200                                       |
| `npm run test:e2e`     | Six passed against a mock production preview                                                           |
| `npm run format:check` | Passed                                                                                                 |
| `npm audit`            | Zero vulnerabilities                                                                                   |
| Secrets/artifacts      | No credentials, private keys, environment files beyond `.env.example`, logs or build artifacts tracked |

Browser coverage included solo and custom challenge flows at 320×740, 360×740 and desktop, a real one-minute two-tab Duel with identical sequence and result reason, current-word mini-grid, refresh, rematch, 1/2/5-minute room creation, room capacity, guest/host lobby departure, countdown cancellation, reconnect, leave confirmation and twenty-second forfeit. Console/page-error smoke tests passed. An unconfigured production build showed the friendly Duel setup message and requested only the main JavaScript during solo play.

Main JavaScript is approximately 372 kB / 130 kB gzip, versus the original 361 kB / 126 kB. The Duel UI adds approximately 36 kB / 12 kB gzip only when opened; the Firebase SDK loads only for the Firebase transport. Vercel hostname metadata transformation was checked locally without creating a deployment.

The owner still needs to create the Firebase project, enable Anonymous Auth and Realtime Database, publish `database.rules.json`, and set build-time environment variables. Follow [SETUP_REALTIME.md](SETUP_REALTIME.md). Actual external anonymous sign-in and two-device Firebase traffic need that project; anonymous initialization is covered with mocked SDK regressions, and real database transport operations are covered with authenticated emulator clients. Offline final scores remain provisional until pending submissions synchronize.

Implementation history before this verification record: `97cd476` audit; `0892220` existing-mode fixes; `94fc961` Duel; `17c9ec7` tests/CI; `145bb7c` deployment readiness/docs; `b60136a` Firebase StrictMode identity fix.

## Follow-up: configured Firebase smoke test

On 11 October 2026, the owner completed Firebase setup and supplied the exact database endpoint. The local ignored `.env.local` was configured for the Firebase transport. A real-project two-tab browser test passed anonymous authentication, room creation/join, synchronized countdown, live color-pattern updates, refresh/board recovery, leave/forfeit results and room deletion. No page/console errors or failed Firebase API responses were observed. This follow-up validates the external authentication and database connection that were pending at the initial release. No deployment was performed, and local Firebase values remain untracked.

## Follow-up: production deployment

On 11 October 2026, the owner authorized deployment. Vercel project `custom-wordle` was configured for Node 24.x and Vite, with Firebase build variables in Production and Preview. Production is available at [custom-wordle-nine.vercel.app](https://custom-wordle-nine.vercel.app). The public homepage returned HTTP 200 without Vercel authentication. Production browser checks passed solo guesses and refresh, Firebase anonymous sign-in in two separate browser sessions, room creation/join, countdown, matching guess patterns, shared progress, refresh recovery, timed results, rematch and room cleanup, with no page errors. The manifest, icon and social image returned their expected content types; social metadata uses the production origin. Environment files remain untracked. The CLI deployment succeeded; automatic GitHub deployment remains unconnected because Vercel could not connect the repository.
