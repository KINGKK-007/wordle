# Custom Wordle 🟩🟨⬛

A production-quality Wordle clone with **Unlimited Mode** and **2-Player Mode**, built with Vite + React + TypeScript. Pixel-for-pixel NYT Wordle dark theme.

![Custom Wordle Screenshot](https://placeholder.com/screenshot)

## Features

- 🎮 **Unlimited Mode** — Play endless Wordle games with random words, track stats and streaks
- 🤝 **2-Player Mode** — Player 1 sets a secret word → generates a shareable link + 8-char challenge code → Player 2 guesses
- 🌙 **NYT Dark Theme** — Exact color tokens, typography, animations, and layout
- 🔤 **Hard Mode** — Revealed hints must be used in subsequent guesses
- 🎨 **High Contrast Mode** — Orange/blue colorblind-friendly palette
- ♾️ **No Backend** — 100% client-side, stats in localStorage
- 📱 **Fully Responsive** — Works on 320px mobile to widescreen desktop

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Build & Deploy

```bash
npm run build    # builds to ./dist
npm run preview  # preview the production build
```

### Deploy to Vercel (recommended for 2-Player links)

```bash
npm install -g vercel
vercel --prod
```

Or connect your GitHub repo to [vercel.com](https://vercel.com) for automatic deploys.

### Deploy to Netlify

1. Push to GitHub
2. Connect repo on [netlify.com](https://netlify.com)
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Create a `public/_redirects` file with: `/* /index.html 200` (for hash routing — actually not needed since we use hash-based routing)

## Running Tests

```bash
npx tsx tests/core.test.ts
```

All 13 tests should pass, covering:
- `evaluateGuess` with duplicate letter edge cases (ABBEY/BOBBY, etc.)
- `encodeWord` / `decodeWord` roundtrip (Base64 + XOR)
- `encodeToCode` / `decodeFromCode` roundtrip (8-char challenge codes)
- `getBestLetterState` priority logic

## Architecture

```
src/
├── components/
│   ├── Board.tsx           # 6×5 grid
│   ├── Row.tsx             # 5-tile row + shake animation
│   ├── Tile.tsx            # Single tile + flip/bounce animations
│   ├── Keyboard.tsx        # 3-row QWERTY keyboard
│   ├── Key.tsx             # Individual key with state colors
│   ├── Header.tsx          # Title + icon buttons (SVG)
│   ├── Toast.tsx           # Animated toast notifications
│   ├── Modal.tsx           # Base modal (backdrop, escape key, focus trap)
│   ├── HelpModal.tsx       # How to play + examples
│   ├── StatsModal.tsx      # Stats + guess distribution chart
│   ├── SettingsModal.tsx   # Hard mode + high contrast toggles
│   ├── ResultModal.tsx     # Win/loss result + share
│   ├── HomeScreen.tsx      # Mode selector
│   ├── GameScreen.tsx      # Main game composition
│   ├── SetWordScreen.tsx   # Player 1 word setter (2P)
│   ├── ShareLinkScreen.tsx # Share link + code (2P)
│   └── CodeInputScreen.tsx # Enter challenge code (2P)
├── hooks/
│   ├── useGame.ts          # Core game state machine
│   ├── useKeyboardInput.ts # Physical keyboard listener
│   ├── useLocalStorage.ts  # Typed localStorage hook
│   └── useToast.ts         # Toast queue management
├── utils/
│   ├── evaluateGuess.ts    # Two-pass duplicate-letter algorithm
│   ├── wordCodec.ts        # XOR + Base64/Base32 encoding
│   ├── shareResult.ts      # Emoji grid generator
│   └── stats.ts            # localStorage stats persistence
├── data/
│   ├── answers.ts          # 2,315 official Wordle answers
│   └── validGuesses.ts     # 14,854 valid 5-letter words
└── styles/
    ├── variables.css       # CSS design tokens
    ├── animations.css      # Keyframe animations
    └── global.css          # All component styles
```

## 2-Player Mode Flow

1. **Player 1** clicks "2-Player Mode" → types a 5-letter word (hidden by default)
2. App validates the word is in the dictionary
3. Clicks "Generate Challenge Link" → gets:
   - A shareable URL: `https://yourapp/#/play?w=<XOR+Base64>`
   - An 8-char challenge code (Base32 encoded)
4. **Player 2** opens the link (or enters the code on the home screen)
5. Plays standard Wordle — the word is never visible in plain text in the URL
6. Result screen shows win/loss, share emoji grid, and "Set a New Word" button

## Word Codec Security

The word in the URL is obfuscated using:
1. XOR each character code with a rotating 5-byte salt key
2. Base64-encode the result with URL-safe characters (`-` and `_` instead of `+` and `/`)

The 8-char challenge code uses Base32 encoding of the same XOR'd bytes.
This prevents casual inspection but is not cryptographically secure — it's designed to prevent spoilers, not adversarial decryption.

## Color Tokens (NYT Dark Theme)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#121213` | Page background |
| `--correct` | `#538d4e` | Green (right spot) |
| `--present` | `#b59f3b` | Yellow (wrong spot) |
| `--absent` | `#3a3a3c` | Gray (not in word) |
| `--key-bg` | `#818384` | Default keyboard key |
| `--tile-border-empty` | `#3a3a3c` | Empty tile border |
| `--tile-border-filled` | `#565758` | Filled tile border |

High contrast overrides: `--correct` → `#f5793a` (orange), `--present` → `#85c0f9` (blue)

## Duplicate Letter Handling

Uses the exact NYT two-pass algorithm:

1. **Pass 1**: Mark all correct (green) positions, count remaining letters
2. **Pass 2**: Mark present (yellow) only up to remaining count of that letter

Example: answer `ABBEY`, guess `BOBBY`
- Pass 1: pos2=`B` (green ✅), pos4=`Y` (green ✅). Remaining: `A`, `B`, `E`
- Pass 2: `B` at pos0 → yellow (1 B remaining), `O` → absent, `B` at pos3 → absent (0 B left)
- Result: `🟨⬛🟩⬛🟩`
