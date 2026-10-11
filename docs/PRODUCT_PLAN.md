# Custom Wordle: multiplayer product and launch plan

Date: 12 October 2026
Production: https://custom-wordle-nine.vercel.app
Repository: https://github.com/KINGKK-007/wordle

## 1. Product decision

Make the app the easiest way to turn a familiar five-letter puzzle into a moment with a friend. Lead with live competition, offer personal challenges when friends cannot play together, and keep unlimited practice one tap away.

The promise is **“Five letters. Better together.”** The multiplayer explanation is **“Same words. Same clock. Friendly rivalry.”** Those lines describe actual behavior. Do not claim to be the first multiplayer Wordle, the largest community, or a ranked competitive service.

Keep **Custom Wordle** as the existing product name for this release. Change the mode names, hierarchy, invitations, onboarding and result sharing consistently. A distinctive experience and a recognizable invitation matter more immediately than changing the app's established name and URL. A future standalone brand needs its own naming research; this release does not make a name-availability claim.

Preserve the game people recognize: five letters, six guesses per word, green/yellow/gray feedback, familiar keyboard, dictionary validation, duplicate-letter rules and optional hard mode for solo/custom play. Add social context around that board rather than extra power-ups, currencies or confusing mechanics.

## 2. Repository review and current strengths

The review covers tracked source, hooks, utilities, word-list structure, components, Duel UI/logic/transports, Firebase rules, tests, styles, assets, metadata, build configuration, CI and documentation. Generated dependencies/builds/logs and ignored credential files are outside the source audit. Large dictionary files are reviewed structurally, with their contents exercised through validation and sequence tests.

- React + TypeScript + Vite produces a static frontend on Vercel.
- Hash routes support existing challenge and room links.
- Firebase Anonymous Auth + Realtime Database supports friends on different devices without an account form.
- A MockTransport supports deterministic local integration testing without production credentials.
- Live rooms share the same seeded answer sequence and server-adjusted countdown/clock.
- Local board persistence, connection recovery, rematch, duration options and deterministic tiebreaks are already present.
- The database stores progress patterns rather than guessed letters; ownership and schemas are validated by security rules.
- Solo/custom statistics, accessibility modals, high contrast, keyboard support and mobile layouts already exist.
- Unit, component, transport, emulator and browser tests provide a substantial safety net.

The existing foundations make a focused product release feasible without replacing the backend or introducing subscriptions.

## 3. Who this release is for

**Primary:** friends, couples, siblings and small chat groups who already understand Wordle and want a quick challenge on their phones.

**Secondary:** a person who wants to send a personal word to a friend, and solo players who want to practice before a match.

The first session should answer three questions immediately: What can I play? Does my friend need to be here now? How do I invite them?

No account setup, downloaded app, public matchmaking queue or payment should stand between an invitation and a first friendly game.

## 4. Competitive context and differentiation

Multiplayer word guessing already exists. The following are direct product sources checked for this review, rather than evidence of our own traffic or market share:

- [Worduel](https://worduel.gg/) describes 1v1 word duels and friend rooms. Multiplayer alone is therefore not a unique claim.
- [word.rodeo](https://word.rodeo/) offers custom puzzles for friends. Personal word setting alone is also not unique.
- [Squabble](https://squabble.me/) is another multiplayer word-game destination.

Our proposed advantage is the combination of a familiar six-guess board, simultaneous same-word racing, short configurable sessions, personal asynchronous challenges, fast browser invitations and a calm readable interface. This is a positioning hypothesis to test with players, not proven product-market fit.

Avoid competing by piling on modes. Give each existing mode a clear job and make the invitation-to-rematch loop exceptionally easy.

## 5. Release implementation: navigation and home

Every change in sections 5–10 is part of this release and must be implemented and verified before deployment.

### Home order and names

1. **Live Duel** — primary, visually emphasized, “Race a friend on the same words.” Badge: live, 1v1. Explain 1, 2 or 5 minutes.
2. **Secret Word** — secondary, “Set a word for a friend, or solve theirs.” Explain that friends can play whenever they like.
3. **Unlimited** — third, “Classic solo play, as often as you like.” Keep saved-board recovery and statistics.

Use the three cards as the actual choices. Remove the separate home-page challenge-code button. Code entry belongs inside the matching mode so a four-character puzzle code cannot be mistaken for a five-character room code.

### Home presentation

- Replace generic “Choose a game mode” and long repetitive descriptions with the social promise and short, concrete copy.
- Use Wordle tile motifs and restrained green/yellow accents, with Live Duel carrying the primary emphasis.
- Use compact cards that expose all three modes on common phone sizes; allow scrolling on short screens and at enlarged text sizes.
- Avoid an automatically opened tutorial on the first home visit. Present a small visible rules summary and retain the accessible help button.
- Explain the no-sign-up browser experience and distinguish live vs anytime play without developer terminology.
- Make the home Statistics action start on Live Duel statistics; all three categories remain available.

### Route compatibility

Introduce a Secret Word hub at `#/challenge`, with its own create/join destinations. Preserve `#/set`, `#/code`, `#/play?w=...`, `#/duel` and `#/duel/CODE` so existing shared links keep working. Browser back/forward, reload and invalid links must remain predictable.

## 6. Release implementation: Secret Word

- Add an explicit mode hub with **Create a word** and **Enter challenge code** choices.
- Keep creation and code entry inside Secret Word, including a clear path back to that hub.
- Replace “Player 1 / Player 2 / 2-Player” wording with “you / your friend / Secret Word” in creation, sharing, help, game labels and statistics.
- Explain “Choose a valid five-letter word. Your friend gets six guesses.”
- Preserve the hidden-word input and reveal toggle so a friend beside the setter cannot casually see the answer.
- Label the generated four-character value as a **challenge code**. The share screen should clearly say the puzzle is ready and explain copy/share actions.
- Support native sharing where available and clipboard fallback. Shared text should sound like a personal invitation, carry the product identity, and include a working challenge link.
- Make post-game sharing include a spoiler-free emoji grid and a path into the appropriate mode. Do not leak the answer in shared text.
- Preserve validation, tamper handling, fresh boards for shared puzzles and role swapping through “Create a word”.

## 7. Release implementation: Live Duel

- Apply **Live Duel** consistently to the entry screen, help, game, results, stats and share text; internal Duel identifiers can remain unchanged for compatibility.
- Replace the first-entry blocking tutorial with short inline instructions: invite a friend, both ready, solve the same words before time runs out. Detailed help remains available.
- Separate **Create a duel** from **Join a duel** clearly; give room code entry a visible five-character label.
- Accept pasted invitation links as well as room codes when joining, without confusing them with Secret Word codes. Reject malformed input clearly.
- Keep a saved nickname editable and explain it as the name the friend sees. Do not ask for email or an account.
- Keep the 2-minute default and expose all 1/2/5-minute choices, with a concise indication that 2 minutes is a good first match.
- Improve lobby copy: say who is missing, who has joined, what the host should share and that both players must be ready.
- Keep copy code, copy link and native Share actions. Use active-room links for invitations.
- Make the timer, solved-word count and opponent state easy to scan while leaving the familiar board dominant.
- Keep finished-match scoring transparent: most words solved, fewer guesses on solved words, earlier final solve, more green clues, more yellow clues, then draw. Forfeit is explicit.
- Keep the rematch action prominent and explain that the opponent must accept. A rematch retains the room but uses fresh words.
- **Fix result acquisition links:** sharing a completed match should link to the Live Duel entry screen, not a full/finished room that new friends cannot join. Keep active lobby invitations distinct.
- Preserve offline/provisional-score messaging, reconnect behavior, refresh recovery, host/guest permissions, room capacity and cleanup on normal exit.

## 8. Release implementation: letter reveal reliability

The current solo reveal uses a 300 ms gap between letters, so the fourth and fifth tiles start at 900 and 1,200 ms. The visible flip and the midpoint color/border change are separate animations. Duel uses a different timing scheme. These details can make the tail of the row feel stalled even though earlier tiles look smooth.

- Keep the familiar first-three-letter flip appearance.
- Use a short, equal interval for every column, without a long tail on the final two letters.
- Use one coordinated animation for the flip, background, border and text color, changing colors at the visually hidden midpoint.
- Centralize reveal timing so rendering, completion callbacks, input locks, keyboard updates and Duel word advancement agree.
- Respect reduced motion in JavaScript completion timing as well as CSS, avoiding an invisible input delay.
- Verify all five tiles through the browser's animation timeline, including green/yellow/gray results and high contrast.
- Preserve the rule that input and keyboard feedback do not race ahead of an unfinished reveal. Prevent double Enter and animation timers surviving navigation.

## 9. Release implementation: product consistency and sharing

- Keep a single tone and vocabulary across home, help, headers, game labels, modals, statistics and result text.
- Update page title, description, Open Graph/Twitter descriptions and manifest description to lead with multiplayer and the three clear mode names.
- Preserve the established production hostname, existing app icon and tile-based social artwork where they still represent the product accurately.
- Use native sharing for invitations/results where appropriate, with copy fallback and truthful success/error feedback.
- Keep actual invitations usable on another device and avoid localhost or finished-room acquisition links.
- Do not add fake player counts, fabricated testimonials, misleading “online” badges or artificial scarcity.

## 10. Release implementation: accessibility, quality and delivery

- All primary controls should remain tappable on 320/360 px phones; check keyboard/board overlap and long names.
- Preserve keyboard navigation, visible focus, modal focus trapping, screen-reader labels, high contrast and reduced motion.
- Update meaningful regressions for navigation hierarchy, mode-specific code entry, old routes, invitations/results and reveal behavior.
- Run lint, strict type checks, unit/component tests and production build checks on coherent milestones before pushing.
- Run browser checks of the full revised journey, custom links/codes and a two-client timed match/rematch. Check production Firebase from separate browser sessions.
- Commit and push focused milestones frequently, aiming for the requested 2–3 minute cadence when a coherent, verified change is ready. Do not manufacture empty commits or push known broken source merely to meet a timer.
- Deploy to the existing Vercel production project and verify the public stable URL after the final release.
- Update README/setup/verification documents to describe shipped behavior accurately.

## 11. Marketing and growth plan

### The invitation loop

Host opens Live Duel → sends a room link → friend joins without signing up → both play → results make the outcome understandable → rematch stays in the same room → spoiler-free result sharing introduces another friend through a usable mode link.

The asynchronous loop is: choose a personal word → send a challenge → friend solves it when convenient → friend creates a word in return. Market this as “I picked this one for you,” rather than falsely presenting it as simultaneous multiplayer.

### Launch message

“Your Wordle group chat can finally play together. Race the same five-letter words in a two-minute Live Duel, send a personal Secret Word, or practice in Unlimited. Open a link. Bring a friend. No sign-up.”

Use a real short mobile recording showing invitation, synchronized start, one guess and rematch. Show the actual UI and a real outcome. Feature the Live Duel experience first; explain the other two modes after the core promise lands.

### Initial distribution

Start with the owner's existing friend/chat groups and small puzzle communities where promotion is allowed. Run friend-pair sessions and observe joins, misunderstandings and exits. Ask for feedback on friction and fairness rather than generic ratings. Outreach/social posting is a separate owner action; this task does not send messages to people or publish promotional posts.

Test two honest hooks: “Same word. Same clock. Who gets there first?” and “Send your friend a word only you would choose.” Measure which invitation actually produces a completed game; clicks alone are insufficient.

### Landing and discovery

Use descriptive metadata such as multiplayer Wordle-style game, live word duel and custom word challenges. Keep the page readable without promotional clutter. Hash-routed mode screens share the frontend's base metadata; mode-specific unfurls would require a later URL/server-rendering design. Do not promise SEO gains from renaming buttons alone.

## 12. Business model and measurement

For this launch, keep the core friend game free, with no account wall, ads interrupting a match or payment integration. Validate that friends return before introducing monetization.

Potential later paid value: optional visual themes, curated word packs, hosted event tools and private group features. Basic invitations, fair play and rematches should remain usable. Validate willingness to pay rather than assuming a subscription will work.

**North-star metric:** completed friendly matches per active pair per week.

Suggested funnel: mode opened → room created → invitation shared → friend joined → both ready → match finished → rematch accepted. Complement with invite-to-join time, code error rate, abandoned lobbies, return pairs and custom challenge completion.

Analytics are a later explicit infrastructure task: this release does not silently collect player identity, guessed words or persistent tracking. Local statistics are device/browser data, not a central business analytics dashboard. Proposed event names should use counts/status/durations, not private word contents. Baselines must come from actual play; no traffic or conversion numbers are fabricated in this plan.

## 13. Future investments and prerequisites

These are business-scale directions, explicitly outside the implementation of this focused release. They need user validation or additional infrastructure and are not presented as shipped features.

| Direction                                 | Value                                 | Required evidence or infrastructure                                                  |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| Best-of series / persistent rival history | Stronger repeat-pair ritual           | Verify rematch demand; decide cross-session identity and ownership                   |
| Co-op shared puzzle                       | A less competitive multiplayer option | User testing, new synchronized guess model and permissions                           |
| Small group/party rooms                   | Chat-group activation                 | Real multiplayer seating, score presentation, capacity/rule redesign                 |
| Daily friend challenge                    | A habit beyond spontaneous matches    | Calendar/time-zone policy, curated words and consistent replay rules                 |
| Cross-device profiles                     | Persistent identity and rivalry       | Optional account design, migration from anonymous sessions, privacy controls         |
| Public matchmaking/rankings               | Broader competitive audience          | Server-authoritative scoring, abuse prevention, moderation and enough concurrency    |
| Creator/education word packs              | New distribution and possible revenue | Dictionary/content controls, accessibility and measured demand                       |
| Localization                              | More communities                      | Curated language lists and keyboard layouts; do not simply translate English answers |
| Acquisition analytics                     | Evidence-based growth                 | Explicit tracking/privacy design and a real analytics backend                        |
| Scaled backend operations                 | Reliable campaigns                    | Stale-room cleanup, monitoring, cost alerts, rate limits/App Check assessment        |

Current scoring is computed by clients from shared progress, and answers can be derived from the bundled list and seed. That supports friendly competition; it does not support an honest claim of cheat-proof ranked play. Abandoned rooms can outlive their join window until an owner/trusted cleanup process removes them. Review capacity and operations before a large campaign.

## 14. Release acceptance checklist

- [ ] Home order is Live Duel → Secret Word → Unlimited.
- [ ] Home has no standalone challenge-code entry and no automatic modal blocking mode selection.
- [ ] Secret Word has its own create/join hub and working old/new routes.
- [ ] Four-character challenge codes and five-character room codes have distinct context.
- [ ] Invitations, help, headings and statistics use the shipped names.
- [ ] Live Duel join accepts the documented code/link formats and handles malformed input.
- [ ] Completed Duel shares route new players into Live Duel rather than a finished room.
- [ ] Five tile reveals have consistent appearance/cadence and correct completion behavior.
- [ ] Reduced motion and high contrast work with the revised reveal.
- [ ] Solo/custom mechanics and persistence still pass regressions.
- [ ] Two separate clients finish a match, agree on results, rematch and exit cleanly.
- [ ] Phone/desktop checks, lint, types, tests and production build pass.
- [ ] Focused commits are pushed to GitHub; no environment files or credentials are tracked.
- [ ] Existing stable production URL serves the verified new release.

Release evidence and exact outcomes will be recorded in `docs/VERIFICATION.md` after implementation.
