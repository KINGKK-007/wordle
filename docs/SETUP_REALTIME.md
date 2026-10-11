# Set up realtime Duel

The production app is live at [custom-wordle-nine.vercel.app](https://custom-wordle-nine.vercel.app), with Firebase configured for realtime Duel. Unlimited and custom challenges work without Firebase. Duel defaults to a same-browser mock in development; follow these steps when configuring another environment.

## 1. Create the project and web app

1. Open [Firebase Console](https://console.firebase.google.com/) and choose **Add project**.
2. Enter a project name, for example `Custom Wordle`. Google Analytics is optional; disable it if unwanted. Click **Create project**, then **Continue**.
3. On Project Overview, click **Add app**, then choose **Web** (`</>`). Name the app `Custom Wordle`. Do not select Firebase Hosting; the frontend will eventually be hosted on Vercel.
4. Register the app. In **Project settings → General → Your apps → SDK setup and configuration**, choose **Config**. Keep this page open for step 4.

## 2. Enable anonymous sign-in

1. Open **Security → Authentication → Get started** (or use the **Authentication** project shortcut).
2. Select **Sign-in method → Add new provider → Anonymous**.
3. Enable it and click **Save**.
4. Under **Authentication → Settings → Authorized domains**, add the eventual Vercel/custom hostname after it exists. Add `localhost` for local testing if it is absent (new projects may not include it).

Anonymous Auth uses session persistence: each tab has its own player identity, and reloading that tab restores it. Two friends normally use separate devices. Closing the browser session ends that anonymous session; rejoining later from a new identity cannot restore the old player's private board.

## 3. Create the Realtime Database and publish rules

1. Open **Databases and storage → Realtime Database → Create Database**.
2. Choose the region nearest your players. Use **Locked mode**, then **Enable**.
3. Copy the database endpoint displayed **inside the Data tab, above the database tree**. It ends in `.firebaseio.com` or `.firebasedatabase.app`. The browser address starting with `console.firebase.google.com` is the console page, not this endpoint. Use the exact displayed endpoint, including its regional hostname.
4. Select **Rules**, replace the contents with the complete [database.rules.json](../database.rules.json) from this repository, and click **Publish**.
5. Do not use test-mode public read/write rules.

Rules require authentication and deny listing `/rooms`. Someone who knows an exact code can read that room. The host owns lifecycle metadata; a guest has a narrow transaction-protected guest-seat claim. Only the two named seats can have player/progress nodes, and each player may write only their own data. Own readiness/rematch votes include the current seed to invalidate old votes. A validated forfeit claim allows the connected guest to preserve a host disconnect result. Names, durations, status, patterns, counts and timestamps are validated; unknown fields are denied. Words and guessed letters are never written to shared state.

## 4. Configure local environment variables

1. Copy `.env.example` to `.env.local` (ignored by Git).
2. Change `VITE_DUEL_TRANSPORT` to `firebase`.
3. Copy the web config fields into these variables:

| Firebase field           | Variable                            |
| ------------------------ | ----------------------------------- |
| `apiKey`                 | `VITE_FIREBASE_API_KEY`             |
| `authDomain`             | `VITE_FIREBASE_AUTH_DOMAIN`         |
| Database URL from step 3 | `VITE_FIREBASE_DATABASE_URL`        |
| `projectId`              | `VITE_FIREBASE_PROJECT_ID`          |
| `storageBucket`          | `VITE_FIREBASE_STORAGE_BUCKET`      |
| `messagingSenderId`      | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId`                  | `VITE_FIREBASE_APP_ID`              |

The first five required values are API key, auth domain, database URL, project ID and app ID; storage bucket and sender ID are optional for Auth/Realtime Database. This public web config is not an admin credential. Never put service-account credentials in `VITE_*`: Vite embeds all such variables in public JavaScript.

4. Restart `npm run dev` after changing environment variables.
5. Create a Duel in one tab and open the room link in another tab, browser or device. On another device, use the development host's LAN address with `npm run dev -- --host`; both devices must be on the same network.

## 5. Configure Vercel

When the owner chooses to deploy:

1. Import the GitHub repository into a Vercel project and choose the **Vite** preset.
2. Set Node.js **24.x**, build command `npm run build`, and output `dist`.
3. Open **Project → Settings → Environment Variables**. Add `VITE_DUEL_TRANSPORT=firebase` and all Firebase values above for the intended Production/Preview environments.
4. Build/redeploy after changing env vars, since they are embedded at build time.
5. Add the resulting hostname to Firebase Auth authorized domains. Social preview image URLs use Vercel system hostname variables automatically; keep **Automatically expose System Environment Variables** enabled, or set optional `VITE_SITE_URL` to your public origin.
6. Verify two-device join, readiness, countdown, progress, reconnect and rematch.

The current `custom-wordle` Vercel project has Production and Preview Firebase settings and was deployed from the CLI. Automatic GitHub deployments are not connected; connect `KINGKK-007/wordle` in Vercel to enable deployment on pushes. Future CLI releases can use `npx vercel --prod` from this linked workspace.

A production build without required Firebase config displays “Duel mode isn't configured yet.” Explicit `mock` production builds are useful for preview testing but only synchronize tabs within one browser profile and origin; they cannot connect friends on separate phones.

## Presence, clocks and limitations

Firebase's `.info/serverTimeOffset` corrects the clock; `onDisconnect` updates presence on the database server. The UI derives start/end from absolute timestamps, including after backgrounding. A disconnect that lasts 20 seconds during play forfeits; returning earlier preserves the board and remaining time. Local snapshots retain your letters while shared progress contains only patterns. Writes are retried on reconnect. Realtime Database's web SDK does not persist its unsent queue across a reload, so local snapshots are also used to recover pending progress.

The seed and answer list are public client data. A determined user can derive target words or forge their own scores; this is a friends game, not a ranked competitive service. Rules enforce ownership and shape, not authoritative evaluation. Firebase network failure detection may lag actual connectivity; the 20-second grace starts when shared presence records the disconnect.

## Optional stale-room cleanup

Rooms expire six hours after creation for joining; hosts delete rooms when closing a lobby or leaving results. Browser-only clients cannot guarantee deletion when a host never returns. Optionally use a trusted scheduled Cloud Function/Admin SDK to remove `rooms` whose `meta.createdAt` is older than six hours. Use the Admin SDK on trusted infrastructure only and assess billing before enabling scheduled functions. No such paid/server component is required for normal play.

## Validate the security rules locally

Install the pinned Node version and Java 21, then run:

```sh
npm ci
npm run test:rules
```

This launches only the local database emulator for the demo project, runs ownership/capacity/schema tests and shuts it down. It does not create or deploy any Firebase project.

References: [Firebase presence and offline behavior](https://firebase.google.com/docs/database/web/offline-capabilities), [Auth persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence), [Realtime Database security](https://firebase.google.com/docs/database/security), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel system variables](https://vercel.com/docs/environment-variables/system-environment-variables).
