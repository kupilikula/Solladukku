# Solmaalai (சொல்மாலை) - Tamil Scrabble Game

See [AGENTS.md](./AGENTS.md) for detailed project documentation, architecture, and implementation status.

## Quick Start

**Terminal 1 - WebSocket Server:**
```bash
cd server
npm install
npm run setup    # Downloads FST models for server-side word validation
npm start
```

**Terminal 2 - React App:**
```bash
npm install
npm start
```

The app runs on `http://localhost:3000` and shows a landing page. Create a new game or join one with a code. The WebSocket server URL is configured in `.env` (default: `ws://localhost:8000`).

To test multiplayer: create a game in one window, use the invite button to copy the link, then open it in a second window (or incognito).

## Key Commands

- `npm start` - Start React development server
- `npm test` - Run tests
- `npm run build` - Production build
- `cd server && npm run setup` - Download FST models for server-side validation
- `cd server && npm start` - Start WebSocket server (with FST validation)

### Dictionary Build Commands (requires `brew install foma`)

- `cd wordlists && python3 generate_fst_forms.py` - Generate noun/adj/adv inflections from FST models
- `cd wordlists && python3 build_dictionary.py` - Build combined dictionary (merges all sources)

## Architecture

- **Landing Page**: `App.js` shows create/join game screen; skipped when arriving via invite link (`?game=`)
- **State**: Redux Toolkit with 5 slices (Game, WordBoard, LetterRack, ScoreBoard, LetterBags)
- **Actions**: Defined centrally in `src/store/actions.js` (28 actions), consumed by multiple slices via `extraReducers`
- **Networking**: WebSocket context (`src/context/WebSocketContext.js`) manages room-based connections, message dispatch, chat, and request-response pattern for validation. Only connects after entering a game (not on landing page).
- **I18n**: Language context (`src/context/LanguageContext.js`) provides Tamil/English toggle across all UI including landing page
- **Game Sync**: `src/hooks/useGameSync.js` handles initial tile draws and game-over detection
- **Components**: `GameFrame` wraps `PlayingBoard` (board + rack + actions) and `InfoBoard` (scores + history + bags + chat)
- **Word Validation**: Two-tier system — client-side binary search on 2.85M-word dictionary, with server-side FST fallback via WebSocket for words not in the static dictionary
- **Analytics**: SQLite via `better-sqlite3` (`server/analytics.js`) — tracks visits, games, and turns. REST API on same port as WebSocket. Client fires visit events from `App.js`.
- **Multiplayer**: Room-based via `?game=` URL query param; max 2 players per room
- **Deployment**: Railway (Dockerfile-based). Auto-deploys on push to `main`. `railway.toml` limits build triggers to code changes only.
- **Custom Domain**: `solmaalai.com` (with `சொல்மாலை.com` redirecting via Namecheap)
- **URL Detection**: In production, WebSocket and API URLs are auto-derived from `window.location` — no env vars needed

## Branding

- **Game name**: "சொல்மாலை" displayed on landing page
- **Logo**: Place a `logo.png` in `public/` — the landing page renders it above the title (96px height, hides gracefully if missing)
- **HTML title**: Set in `public/index.html` `<title>` tag
