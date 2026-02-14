# Solmaalai (சொல்மாலை) - Tamil Scrabble Game

A React-based Tamil Scrabble game with a landing page, real-time multiplayer via WebSockets, single-player vs computer mode, room-based game management, bilingual UI (Tamil/English), and two-tier word validation.

## Documentation Maintenance

- Always keep `AGENTS.md` up to date with the current codebase status. Any feature, flow, API, schema, deployment, or behavior change must be reflected here in the same PR/commit.

## Technology Stack

- **Frontend**: React 18.2.0 with Create React App
- **State Management**: Redux Toolkit (@reduxjs/toolkit 1.9.7)
- **Drag & Drop**: react-dnd v16.0.1 with HTML5 and Touch backends
- **Real-time**: WebSockets with room-based multiplayer (runtime URL auto-derived; localhost dev defaults to port 8000)
- **I18n**: React Context-based Tamil/English language toggle
- **UI**: react-icons, react-tooltip, react-select, react-fitty
- **Server**: Node.js with ws library, foma/flookup for FST validation, origin/rate-limit hardening, SQLite analytics
- **Dictionary Build**: Python 3 scripts, foma toolkit for FST morphological generation
- **Deployment**: Railway (Dockerfile-based, auto-deploy on push to `main`). Server serves both API/WebSocket and React static build as a single service.
- **Dictionary Storage**: Git LFS (135MB file exceeds GitHub's 100MB limit). Dockerfile auto-downloads from GitHub if LFS pointer isn't resolved.

## Project Structure

```
deploy/
├── nginx.conf                # nginx config (static files + WebSocket proxy + gzip + TLS)
└── DEPLOY.md                 # Step-by-step deployment guide for Digital Ocean
server/
├── index.js                  # HTTP + WebSocket server: rooms, hardening, FST validation, REST API
├── analytics.js              # SQLite analytics: visits, games, turns tracking
├── geo.js                    # Geo-IP resolver (provider + cache + IP hashing)
├── download-fsts.js          # Script to download FST models from ThamizhiMorph
├── package.json              # Server deps (ws, better-sqlite3); scripts: start, setup
├── analytics.db              # SQLite database (auto-created, gitignored)
└── fst-models/               # Runtime FST model files (16 downloaded; 11 core loaded by default)
wordlists/
├── build_dictionary.py       # Builds combined dictionary from all sources
├── generate_fst_forms.py     # Generates noun/adj/adv inflections via flookup
├── tamillexicon_headwords.txt # Tamil Lexicon source headwords (107K)
├── fst-models/               # Cached FST models for offline generation
├── fst_generated_forms.txt   # Output: 1.16M FST-generated surface forms
├── cache/                    # Cached downloads (verb files, Wiktionary TSV)
└── WORD_VALIDATION_PLAN.md   # Original research & phased implementation plan
public/
├── logo.png                  # Game logo (optional — landing page hides slot if missing)
├── tamil_dictionary.txt      # 2.85M-word dictionary served to browser
├── index.html                # HTML shell with <title> and meta tags
└── manifest.json             # PWA manifest with game name
src/
├── App.js                    # Landing page + game entry: userId, gameId, mode routing
├── ai/
│   ├── aiEngine.js           # AI move generation: anchor-based search, prefix pruning, timeout/server-assisted fallback validation, scoring
│   └── aiHelpers.js          # Grid building, anchor finding, dictionary/prefix checks, adaptive swap utilities
├── context/
│   ├── WebSocketContext.js   # WebSocket: room connection, chat, sendRequest (req-response)
│   └── LanguageContext.js    # Tamil/English toggle with 50+ translation keys
├── hooks/
│   ├── useGameSync.js        # Multiplayer game sync (auto-start, initial draw, game-over)
│   ├── useAIGameSync.js      # Single-player AI lifecycle (init, turn orchestration, rack mgmt)
│   ├── useGameSnapshotSync.js # Debounced multiplayer snapshot persistence for refresh-safe resume
│   └── useSoloGamePersistence.js # Single-player DB persistence (start/turn/end/snapshot) for My Games resume/review
├── components/
│   ├── AnalyticsViewer.js    # Password-protected analytics inspector (`?analytics=1`) with session-cached admin header, visible API error messaging, board replay fallback from formed-word tile coordinates, and per-turn Jump controls
│   ├── GameFrame.js          # Main layout: SinglePlayer/Multiplayer wrappers + GameOverOverlay
│   ├── GameReviewViewer.js   # Read-only game review screen with board replay slider + jump-to-turn
│   ├── PlayingBoard.js       # Game board with DnD provider
│   ├── WordBoard.js          # 15×15 Scrabble board grid
│   ├── Square.js             # Individual board square with drop logic
│   ├── LetterRack.js         # Player's 14-slot tile rack
│   ├── RackSlot.js           # Individual rack slot
│   ├── LetterTile.js         # Draggable tile: activation, swap-mode click, merge/split
│   ├── ActionMenu.js         # Game controls + HelpModal + ConfirmDialog + invite + swap mode
│   ├── InfoBoard.js          # Right sidebar: scores, bags, history, chat, language toggle
│   ├── ScoreBoard.js         # Score display with turn indicator badge
│   ├── LetterBags.js         # Remaining tile counts (Tamil-only labels: மெய், உயிர், மாயம்)
│   ├── TurnHistory.js        # Move history with words, scores, passes, swaps (+ swap tile count)
│   ├── ConnectionStatus.js   # Connection/turn status (adapts for single-player: "vs Computer")
│   ├── Chat.js               # Real-time player chat (500 char limit, timestamps)
│   └── ChooseLetter.js       # Modal for bonus tile letter selection
├── store/
│   ├── store.js              # Redux store configuration (5 reducers)
│   ├── actions.js            # 29 action creators (includes `hydrateGameSnapshot`)
│   ├── WordBoardSlice.js     # Board tile state (played + unplayed positions)
│   ├── LetterRackSlice.js    # Player rack state (14 slots, swap/shuffle/split)
│   ├── ScoreBoardSlice.js    # Scores, turn history, multiplier calculations
│   ├── GameSlice.js          # Game metadata: userId, gameId, gameMode, swapMode, turn tracking
│   └── LetterBagsSlice.js    # Tile bag inventory (vowels, consonants, bonus)
├── utils/
│   ├── TileSet.js            # Tamil tile definitions (points, types, merge/split ops)
│   ├── constants.js          # Game constants and helpers
│   ├── dictionary.js         # Dictionary loader, binary search, server validation cache
│   ├── initialLetterBags.js  # Initial tile distribution counts
│   └── squareMultipliers.js  # 15×15 board multiplier map
└── styles/
    └── Styles.css            # All component styles, animations, toasts
.env                          # Optional frontend overrides (not required for API/WS routing)
.env.production               # Optional frontend production overrides (usually empty)
ecosystem.config.js           # PM2 process manager config (legacy DO deploy)
Dockerfile                    # Combined build: React frontend + Node.js server (with LFS fallback)
.dockerignore                 # Excludes node_modules, env files, wordlists from Docker context
railway.toml                  # Railway deploy config: watchPatterns to skip doc-only builds
```

## Landing Page (`src/App.js`)

The app opens to a landing page before entering any game:

- **Game title**: "சொல்மாலை" in large peacock blue text
- **Logo**: Renders `public/logo.png` above the title (96px height). Hides gracefully via `onError` if the file is missing.
- **Persistent username**: Editable username input (saved in `localStorage` and synced to server profile)
- **Username gate**: If `/api/profile` reports username conflict (`409`), game entry actions are disabled until user picks an available name
- **"New Game With Invited Opponent" button** (`புது ஆட்டம் அழைப்புடன்`): Creates a private multiplayer room, sets `?game=` in URL, and auto-opens invite modal in-game
- **"Play Random Opponent" button** (`யாவொருவருடன் விளையாடு`): Joins queue-based matchmaking; on match, navigates to matched `gameId`
- **"Play vs Computer" button**: Starts a single-player game against the AI (no WebSocket, no game code needed)
- **"Join Private Game" section**: Accepts either room code (4-8 alphanumeric) or full invite URL containing `?game=...`
- **Leaderboard card**: Shows top rated players when data exists (hidden when empty)
- **My Games card**: Shows recent games for this `userId` (in-progress + finished) with **Continue** and **Review** actions
- **"Game Rules" link**: Opens help modal with bilingual game instructions (same content as in-game help)
- **Language toggle**: Top-right corner ("EN" / "த"), shared with in-game toggle via LanguageContext

**URL game bypass**: If someone arrives via `?game=XYZ` (multiplayer) or `?game=solo-...` (single-player), the landing page is skipped entirely and the app attempts direct game resume.
The WebSocket connection is only established for multiplayer entries.

**Analytics inspector route**: Visiting `?analytics=1` opens the admin analytics viewer instead of the game UI.
The password input expects the existing server `ANALYTICS_ADMIN_PASSWORD` secret (it does not create/update server password), stores it only in `sessionStorage`, and sends it via `X-Admin-Password`.

## Color Scheme

Tamil-inspired palette: warm tones (vermilion, gold, coral) + cool accents (peacock blue, teal, jade).

### Board Squares (`src/styles/Styles.css`)

| Square Type | Color | Hex | Inspiration |
|-------------|-------|-----|-------------|
| Default | Warm gray | `#CCC8C0` | — |
| Word 3× | Deep vermilion | `#B83230` | குங்குமம் (kungumam) |
| Word 2× | Warm gold | `#D4A843` | மஞ்சள் (turmeric) |
| Letter 3× | Deep teal | `#0D6E5C` | மயில் (peacock) |
| Letter 2× | Light jade | `#7BC8B5` | Peacock complement |
| Star | Warm gold | `#D4A843` | Same as Word 2× |
| Star icon | Vermilion | `#B83230` | — |

### Tiles (`src/styles/Styles.css`)

| Tile Type | Background | Border | Text |
|-----------|-----------|--------|------|
| MEY (மெய் consonants) | `#B5D4E6` light peacock blue | `#8AB8CE` | black |
| UYIR (உயிர் vowels) | `#E8BAA8` warm coral | `#CC9480` | black |
| UYIRMEY (உயிர்மெய் combined) | `#000000` black | — | white |
| BONUS (மாயம் wildcard) | `#F0DCA8` cream gold | `#D4B870` | black |
| Played | `#F0DCA8` cream gold | `#D4B870` | black |

Note: Played tiles use the same cream gold as bonus tiles.

### UI Accent Color — Dark Peacock Blue `#1A5276`

Used consistently across: buttons, active score borders, turn badges, connected status, turn history highlights, chat send button, help modal headings, game-over overlay (win color), landing page title and buttons.

| Element | Active/Highlight | Hover |
|---------|-----------------|-------|
| ActionMenuButton | `#1A5276` | `#2176A8` |
| ScoreBoard active border | `#1A5276` | — |
| ScoreBoard active bg | `#DDEAF2` | — |
| Turn badge | `#1A5276` | — |
| Connected dot | `#1A5276` | — |
| "Your Turn" text | `#1A5276` | — |
| My turn entry bg | `#DDEAF2` | — |
| My turn entry border | `#B0C8DA` | — |
| Landing page title | `#1A5276` | — |
| Landing page buttons | `#1A5276` | — |

### Other Colors

| Element | Color |
|---------|-------|
| Page background | `#EDE8E0` warm off-white |
| Rack/panel borders | `1px solid #ddd` |
| Swap-selected tile border | `2px solid #C0392B` vermilion red |
| Activated tile (merge/split) | Shaking + darkening animation per tile type |
| Swap mode toast/button | `#C0392B` |
| Validating toast | `#1565c0` blue |
| Invalid words toast | `#e53935` red |
| Disconnected dot | `#f44336` red |
| Pass/swap history | `#f57c00` / `#fff3e0` orange family |

## Word Validation System

### Two-Tier Architecture

```
submitWord() → local dictionary (binary search on sorted array, <1ms)
  ├─ FOUND → accept immediately
  └─ NOT FOUND → server validation fallback
                    ├─ Multiplayer: send 'validateWords' via WebSocket (`sendRequest`)
                    │   └─ Server returns 'validateWordsResult' (unicast to requester only)
                    ├─ Single-player/no WebSocket: POST `/api/validate-words`
                    ├─ Server runs flookup against 11 core FST models by default
                    ├─ Optional guesser FSTs can be enabled via env
                    └─ ANY FST recognizes word → valid
                  Client caches result → accept or reject
```

### Client-Side Dictionary

- **File**: `public/tamil_dictionary.txt` — 2.85M words, sorted (Unicode codepoint order)
- **Loaded** on app startup via `loadDictionary()` in `src/utils/dictionary.js`
- **Gameplay guard**: Play submission is blocked until dictionary load completes (loading toast + disabled Play button)
- **Lookup**: Binary search using `<`/`>` comparison (NOT `localeCompare` — must match Python's `sorted()` codepoint order)
- **Permissive fallback**: If dictionary fails to load or is too small (< 1000 entries, e.g. LFS pointer), all words are accepted

### Dictionary Sources (built by `wordlists/build_dictionary.py`)

| Source | Words | Description |
|--------|-------|-------------|
| Tamil Lexicon headwords | 106K | Classical Tamil headwords from University of Madras |
| Vuizur Wiktionary TSV | 5.5K | Modern Tamil headwords from Wiktionary |
| ThamizhiMorph Generated-Verbs | 1.69M | Pre-generated verb inflections (18 conjugation classes) |
| FST-generated forms | 1.16M | Noun inflections (case × number), adjectives, adverbs |
| **Total (deduplicated)** | **2.85M** | Filtered to ≤15 Tamil letters |

### FST Form Generation (`wordlists/generate_fst_forms.py`)

1. Downloads FST models from `sarves/thamizhi-morph/FST-Models/` on GitHub
2. Feeds 116K Tamil Lexicon headwords through forward `flookup` to identify recognized nouns
3. Generates all inflected forms via inverse `flookup -i` with morphological tags:
   - `noun.fst`: 16 tags (nom/acc/dat/loc/abl/gen/inst/soc × sg/pl) — 3.5K lemmas → 60K forms
   - `noun-guess.fst`: 16 tags with `+sg`/`+pl` prefix — 94K lemmas → 1.1M forms
4. Also processes adj, adv, part, pronoun FSTs for forward recognition
5. Requires: `brew install foma`

### Server-Side FST Validation (`server/index.js`)

- **11 long-lived core `flookup` child processes** by default (noun/adj/adv/part/pronoun + verb classes), stdin/stdout pipes kept open
- **Optional guess models** (`*-guess.fst`) are disabled by default and enabled only with `ENABLE_GUESS_FSTS=true`
- **FIFO callback queue** per process for concurrent lookups
- **Parallel validation**: word checked against all FSTs simultaneously, accepted if ANY recognizes it
- **Respawn logic**: crashed processes restart after 5s delay, max 3 attempts
- **Strict mode option**: set `STRICT_SERVER_VALIDATION=true` to reject when server-side validation is unavailable
- **Request-response pattern**: `requestId` field matches requests to responses (unicast, not broadcast)

### Server Validation Cache (`src/utils/dictionary.js`)

- Session-level `Map<word, boolean>` — same word never re-queried
- Checks cache before sending to server
- Permissive on timeout (5s) or disconnect

### Validation UI (`src/components/ActionMenu.js`)

- `isValidating` state prevents double-submission during server check
- Blue `.ValidatingToast` with spinner shown during server validation
- Blue `.ValidatingToast` also indicates dictionary preload in progress
- Play button is disabled until dictionary is loaded
- Red `.InvalidWordsToast` shown for rejected words (auto-fades after 3s)

## Analytics System

### Overview

Server-side analytics using SQLite (`better-sqlite3`) with a REST API. The HTTP server and WebSocket server share the same port. Game events are captured server-side by intercepting existing WebSocket messages — no new message types needed.

### Database (`server/analytics.db`)

Five tables with WAL mode enabled:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `visits` | Page view tracking + geo | `page` ('landing'\|'game'), `game_id`, `user_id`, `ip`, `user_agent`, `referrer`, `country_code`, `country`, `region`, `city`, `timezone`, `geo_source`, `geo_resolved_at`, `created_at` |
| `games` | One row per game session + type + country snapshot | `game_id`, `game_type` ('multiplayer'\|'singleplayer'), `player1_id`, `player2_id` (`computer-player` for solo), scores, `winner_id`, `game_over_reason`, `total_turns`, `player1_country_code`, `player2_country_code`, `started_country_code`, `ended_country_code`, `started_at`, `ended_at` |
| `turns` | One row per turn action | `game_id`, `games_row_id` (FK), `user_id`, `turn_type` ('word'\|'pass'\|'swap'), `score`, `words_played` (JSON), `tiles_placed`, `placed_tiles_json` (JSON), `formed_words_json` (JSON) |
| `players` | Persistent profile + rating + last seen geo | `user_id`, `username`, `rating`, `games_played`, `wins`, `losses`, `draws`, `total_score`, `last_country_code`, `last_country`, `last_region`, `last_city`, `last_seen_ip_hash`, `last_seen_at`, `created_at`, `updated_at` |
| `game_state_snapshots` | Per-user resumable multiplayer state snapshots | `game_id`, `games_row_id` (FK), `user_id`, `state_json` (JSON), `updated_at` |

### REST API Endpoints

All endpoints served on the same port as WebSocket (default 8000). CORS uses the same `ALLOWED_ORIGINS` config.

Admin analytics endpoints require:
- Server env var: `ANALYTICS_ADMIN_PASSWORD`
- Request header: `X-Admin-Password`

Without `ANALYTICS_ADMIN_PASSWORD`, admin analytics endpoints return `503`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/visit` | Record a page visit (`{page, gameId, userId}`) |
| `POST` | `/api/profile` | Upsert persistent username/profile (`{userId, username}`) |
| `GET` | `/api/leaderboard?limit=N` | Top players by rating (default 20, max 100) |
| `GET` | `/api/games?userId=...&limit=N` | User-scoped recent games list (in-progress first) |
| `GET` | `/api/games/:gameId?userId=...` | User-scoped game detail with turns + snapshots for resume/review |
| `POST` | `/api/solo/start` | Start/ensure single-player session (`{gameId, userId, username}`) |
| `POST` | `/api/solo/turn` | Record single-player turn (`{gameId, userId, turnType, ...}`) |
| `POST` | `/api/solo/end` | End single-player game (`{gameId, userId, winnerId, reason}`) |
| `POST` | `/api/solo/snapshot` | Save single-player resume snapshot (`{gameId, userId, snapshot}`) |
| `GET` | `/api/admin/summary` | Protected analytics summary (counts + derived stats) |
| `GET` | `/api/admin/games?limit=N&offset=N&q=...` | Protected paginated/searchable games |
| `GET` | `/api/admin/games/:gameId` | Protected game detail with turns + replay fields |
| `GET` | `/api/admin/players?limit=N&offset=N&q=...` | Protected paginated/searchable players |
| `GET` | `/api/admin/players/:userId` | Protected player profile + recent games/turns |
| `GET` | `/api/admin/visits/daily?days=N` | Protected daily visit breakdown (default 30, max 365) |
| `GET` | `/api/admin/visits/countries?days=N&limit=N` | Protected visits grouped by country |
| `GET` | `/api/admin/players/countries?limit=N` | Protected player counts by last-known country |
| `POST` | `/api/matchmaking/join` | Join random-match queue (`{userId, username}`) |
| `GET` | `/api/matchmaking/status?userId=...` | Check random-match queue/match status |
| `POST` | `/api/matchmaking/cancel` | Cancel random matchmaking (`{userId}`) |
| `POST` | `/api/validate-words` | FST validation over HTTP (`{ words: string[] }`, max 20) |
| `GET` | `/health` | Readiness/liveness endpoint (200 when server is ready) |

Route matching note: In `server/index.js`, `/api/admin/players/countries` is matched before `/api/admin/players/:userId` so `countries` is not misinterpreted as a `userId`.

Username uniqueness note:
- Usernames are now case-insensitive unique across all users (`UNIQUE INDEX` on `lower(username)`).
- `/api/profile` returns `409` when a username is taken, with optional `suggestion`.
- Client shows inline error under username input when the chosen name is unavailable.
- Startup migration auto-normalizes legacy duplicate usernames (suffixing conflicts) before creating the unique index.

### Server-Side Event Hooks

Analytics calls are added **after** existing `broadcastToRoom` calls — no change to game behavior:

| WebSocket Message | Analytics Action |
|------------------|-----------------|
| `newGame` | `startGame()` + `setPlayer2()` if opponent in room |
| Player joins (non-reconnection) | `setPlayer2()` if active game exists |
| `turn` | `recordTurn()` with type 'word', score, formed words, and placed tile positions for replay |
| `passTurn` | `recordTurn()` with type 'pass' |
| `swapTiles` | `recordTurn()` with type 'swap' |
| `gameOver` | `endGame()` with winner resolution and reason |
| `stateSnapshot` | `saveGameStateSnapshot()` upsert per `(games_row_id, user_id)` for resumable state |

### Client-Side Visit Tracking (`src/App.js`)

- `getApiBaseUrl()` derives HTTP URL at runtime: localhost dev UI ports route to `http://{host}:8000`; otherwise same-origin
- Landing page: fire-and-forget POST on mount (`page: 'landing'`)
- Game entry: fire-and-forget POST when `gameId` is set (`page: 'game'`, with `gameId` and `userId`)
- Server enriches visits/profiles with coarse geo (country/region/city/timezone) from request IP when `GEO_PROVIDER` is enabled

## Redux Store Structure

### GameSlice
```javascript
{
  userId: string,              // Current player's UUID (persisted in 'solladukku' cookie)
  username: string | null,     // Persistent username (synced to server profile)
  gameId: string,              // Room identifier from URL ?game= param
  otherPlayerIds: string[],    // Other players in the game
  currentTurnUserId: string,   // Whose turn it is
  isMyTurn: boolean,           // Whether it's this player's turn
  gameStarted: boolean,        // Whether the game has started
  needsInitialDraw: boolean,   // Flag to trigger tile draw after sync
  autoStartPending: boolean,   // Flag to auto-start game after WS connects (set for room creator)
  myInitialDraw: string[],     // Tiles drawn at game start (for re-syncing late joiners)
  playerNames: {               // Map of userId to display name
    [userId]: string
  },
  consecutivePasses: number,   // Track consecutive passes/swaps (game ends at 4)
  gameOver: boolean,           // Is the game over?
  winner: string | null,       // Winner's userId, 'opponent', or 'tie'
  gameOverReason: string | null, // 'tilesOut' or 'consecutivePasses'
  swapMode: boolean,           // Whether swap tile selection mode is active
  gameMode: string | null,     // 'singleplayer' or 'multiplayer' (null before game entry)
  soloResumePending: boolean,  // True while URL-based solo resume hydration is in progress
}
```

### WordBoardSlice
```javascript
{
  playedTilesWithPositions: [{row, col, tile}, ...],    // Confirmed tiles
  unplayedTilesWithPositions: [{row, col, tile}, ...],  // Current turn tiles
}
```

### LetterRackSlice
```javascript
{
  tilesList: [tile | null, ...]  // 14-slot rack (null = empty slot)
}
```

### ScoreBoardSlice
```javascript
{
  myCompletedTurns: number,
  myTotalScore: number,
  allTurns: [{
    turnUserId: string,
    turnType: string,             // 'word', 'pass', or 'swap'
    turnFormedWords: [[{row, col, tile, alreadyPlayed}, ...], ...],
    newlyPlayedTilesWithPositions: [...],
    fetchedLettersFromBag: [...],
    turnScore: number,
    wordScores: [number, ...],
  }, ...],
  otherPlayersTotalScores: [number, ...],
}
```

### LetterBagsSlice
```javascript
{
  consonantsBag: {'க்': 40, 'ச்': 40, ...},  // 22 consonants (Mey)
  vowelsBag: {'அ': 50, 'ஆ': 30, ...},        // 12 vowels (Uyir)
  bonusBag: {'?': 10},                        // Wildcard tiles
}
```

## Tamil Tile System

### Tile Types
- **Mey (மெய்)**: 22 consonants with virama mark (்), e.g., க், ச், ட்
- **Uyir (உயிர்)**: 12 standalone vowels, e.g., அ, ஆ, இ
- **Uyirmey (உயிர்மெய்)**: 264 combined consonant+vowel tiles (22 × 12)
- **Bonus (மாயம்)**: Wildcard tiles that can represent any letter

### Tile Mechanics
- **Merging**: Drag a Mey tile onto a Uyir tile (or vice versa) on the rack or board to form an Uyirmey tile
- **Splitting**: Double-click an Uyirmey tile to split it back into Mey + Uyir components
- **Bonus Selection**: Double-click a bonus tile to open the letter selection modal
- **Activation**: Double-click activates a tile (shaking + darkening animation). Only one tile can be activated at a time. Used for merging (drag activated tile onto another), splitting Uyirmey, and selecting bonus letters. Swap mode uses a separate red border selection style.

### Swap Mode
- Click the swap button to enter swap mode (button turns red)
- Any tiles on the board are automatically returned to the rack
- Single-click rack tiles to select/deselect them (red border)
- Click the swap button again to confirm the exchange
- Cancel button exits swap mode without swapping
- Dragging is disabled during swap mode
- Instruction toast below the buttons shows count of selected tiles

## Action Menu Button Order

Normal mode (left to right): **Pass** | **Swap** | **Return** | **Shuffle** | **Play** | **Help** | **Invite** (hidden in single-player) | **New Game**

Swap mode: Only **Swap** (red confirm) and **Cancel** buttons visible.

### Confirmation Dialogs
- **Pass Turn**: Shows bilingual confirmation dialog before passing
- **New Game**: Shows confirmation dialog if a game is currently in progress (`gameStarted && !gameOver`). Starts immediately if no game is active.

## WebSocket Protocol

### Connection
```
{WS_BASE_URL}/{gameId}/{userId}?name={username}
```

`WS_BASE_URL` is derived at runtime. In localhost dev (ports `3000/5173/4173`), it targets `ws://{host}:8000`; otherwise it uses same-origin `ws(s)://{host}`.

The WebSocket connection is managed via React Context (`WebSocketContext.js`), providing:
- Auto-reconnect on disconnect (3-second delay)
- Connection state tracking (`isConnected`, `connectionError`)
- `sendTurn(turnInfo)` — broadcast turn to other players in room
- `sendMessage(message)` — generic fire-and-forget broadcast to room
- `sendRequest(message, timeoutMs)` — request-response with `requestId` matching, returns Promise
- `sendChat(text)` — send chat message (trimmed to 500 chars)
- `chatMessages` state — array of `{userId, username, text, timestamp}` objects

### Room Management (Server)
- Rooms are keyed by `gameId`, created on first connection
- Max 2 players per room (additional connections rejected)
- Empty rooms cleaned up after 5-minute delay
- `wsMetadata` WeakMap provides reverse lookup from WebSocket to `{gameId, userId}`
- `broadcastToRoom(gameId, senderId, message)` sends to all OTHER players
- `sendToAllInRoom(gameId, message)` sends to ALL players (used for chat)

### Message Types

**Broadcast Messages (client → server → other clients in room)**

| Type | Direction | Description |
|------|-----------|-------------|
| `turn` | broadcast | Turn with formed words, scores, drawn tiles. Receiver returns any unplayed tiles to rack before applying. |
| `newGame` | broadcast | New game with starting player and drawn tiles |
| `drewTiles` | broadcast | Player drew tiles from bag |
| `swapTiles` | broadcast | Player swapped tiles (returned + drawn) |
| `passTurn` | broadcast | Player passed their turn |
| `gameOver` | broadcast | Game ended (winner, reason) |
| `chat` | all in room | Chat message (text ≤ 500 chars, timestamp from server) |
| `setProfile` | broadcast | Update your username in current room |

**Server → Client Messages**

| Type | Direction | Description |
|------|-----------|-------------|
| `playerJoined` | server→all | New player joined room |
| `joinedExistingGame` | server→joiner | You joined an existing game |
| `roomState` | server→client | Reconnection: current room state |
| `playerProfile` | server→others | Username update for a room player |
| `playerLeft` | server→all | Player disconnected |

**Request-Response Messages (client → server → same client)**

| Type | Direction | Description |
|------|-----------|-------------|
| `validateWords` | client→server | Words to validate via FST (`requestId`, `words[]`, max 20) |
| `validateWordsResult` | server→client | Validation results (`requestId`, `results: {word: bool}`) |

**Client → Server (persist-only, no broadcast)**

| Type | Direction | Description |
|------|-----------|-------------|
| `stateSnapshot` | client→server | Debounced resumable state snapshot (`snapshot` object) persisted in SQLite per user |

### Server Hardening (`server/index.js`)

| Protection | Details |
|-----------|---------|
| Origin validation | `ALLOWED_ORIGINS` env var (comma-separated); rejects unknown origins in production |
| Rate limiting | 30 messages per 1000ms sliding window per connection |
| Message size | Max 100KB per message |
| IP connection limit | Max 10 WebSocket connections per IP |
| Input validation | `validateWords`: max 20 words; `chat`: text ≤ 500 chars, must be string; `turn`: requires object |
| URL validation | Rejects malformed paths (must be `/{gameId}/{userId}`) |
| Room capacity | Max 2 players per room |

## Internationalization

### Language Context (`src/context/LanguageContext.js`)

- Default language: Tamil (`ta`)
- Toggle available on landing page (top-right) and in-game sidebar (InfoBoard top-right)
- Shows "EN" when in Tamil mode, "த" when in English mode
- `useLanguage()` hook returns `{ language, toggleLanguage, t }`
- `t` is the current translation object

### Translation Keys (50+ total)

**UI Labels**: `you`, `opponent`, `yourTurn`, `waiting`, `connected`, `disconnected`, `tilesRemaining`, `total`, `tiles`, `turnHistory`, `noMovesYet`, `chat`, `noMessagesYet`, `typeMessage`, `send`, `turn`, `passed`, `swappedTiles`

**Landing Page**: `createGame`, `playRandomOpponent`, `playVsComputer`, `joinGame`, `enterGameCode`, `join`, `howToPlay`, `myGames`, `continueGame`, `reviewGame`, and other matchmaking/join helper labels are defined in `LanguageContext` and consumed by `App.js`.

**Single Player**: `computer`, `computerThinking`, `vsComputer`

**Help Modal**: `helpTitle` ("Game Rules" / "விளையாட்டு முறை"), `helpClose`, `helpSections` (array of 8 `{title, body}` objects covering: Goal, Tiles, Forming Words, Combining Letters, Bonus Tile, Scoring, Swapping Tiles, Passing)

**Confirmation Dialogs**: `confirmNewGame`, `confirmPass`, `yes`, `no`

**Game Over**: `gameOverTie`, `gameOverWon`, `gameOverLost`, `gameOverPasses`, `gameOverTilesOut`, `gameOverNewGame`, `vs`

### Components Using Translations
- `App.js` — landing page: title, mode actions, join-private input, leaderboard, help modal, language toggle
- `App.js` — landing page: title, mode actions, join-private input, leaderboard, My Games list, help modal, language toggle
- `ScoreBoard.js` — role labels (`t.you`, `t.opponent`), turn badge (`t.turn`), usernames from Redux `playerNames`
- `ConnectionStatus.js` — status text, turn indicator
- `TurnHistory.js` — header, empty state, pass/swap labels (swap entries include swapped tile count)
- `LetterBags.js` — header, total label (tile type labels are Tamil-only: மெய், உயிர், மாயம்)
- `Chat.js` — header, empty state, input placeholder, send button
- `GameFrame.js` — GameOverOverlay result/reason text, player labels
- `ActionMenu.js` — swap mode toast, HelpModal content, ConfirmDialog text

## User Flow

### Landing Page → Game Entry
1. User visits the app → sees landing page with "சொல்மாலை" title
2. User sets/edits username (persisted locally and synced to `/api/profile`)
3. **New Game With Invited Opponent**: Creates 6-char room `gameId` → enters multiplayer game → invite modal auto-opens
4. **Play Random Opponent**: Joins matchmaking queue; once matched, auto-enters assigned `gameId`
5. **Play vs Computer**: Enters single-player game (no WebSocket)
6. **Join Private Game**: Enter code or full invite URL (`?game=...`) → enters multiplayer game
7. **Invite link** (`?game=XYZ`): Bypasses landing page → enters multiplayer game directly
8. **My Games → Continue**: Re-enters an in-progress multiplayer game without remembering the code
9. **My Games → Review**: Opens read-only board replay/final board for a finished game
10. **Solo URL resume** (`?game=solo-...`): Opens single-player game directly and hydrates saved state

### Single Player Flow
1. Player clicks "Play vs Computer" on landing page
2. Game initializes: `storeUserId` dispatched, `GameFrame` rendered without `WebSocketProvider`
3. `useAIGameSync` hook activates:
   - Draws 14 player tiles from fresh bags → fills rack
   - Draws 14 AI tiles from remaining bags → stored in `aiRackRef` (not Redux)
   - Deducts AI tiles from Redux bags via `syncOpponentDraw`
   - Sets `gameMode: 'singleplayer'`, adds `'computer-player'` as opponent
4. Player places tiles and plays → turn switches to AI
5. AI turn (1-2.5s simulated thinking delay):
   - `computeAIMove()` runs anchor-based word search on the board
   - Tries placing rack tiles at anchor positions, pruning with dictionary prefix checks
   - Handles MEY+UYIR tile merging for UYIRMEY combinations
   - Uses a 5s search budget, then runs a timeout-aware quick fallback search before giving up
   - On no-move paths, validates a bounded set of unknown words via HTTP FST (`/api/validate-words`) and retries search
   - Validates all cross-words, calculates scores with multipliers
   - Dispatches `addOtherPlayerTurn` with the best-scoring valid move
   - Falls back to adaptive swap (2-4 tiles, with repeat-avoidance using recent swap signatures) or pass if no valid move found
6. UI adapts: "vs Computer" status, "Thinking..." indicator, "Computer" name in scoreboard, no Chat, no Invite button
7. Game ends same as multiplayer: tiles exhausted or 4 consecutive passes/swaps
8. Single-player sessions are persisted to SQLite (start/turn/end + snapshots) and appear in Landing **My Games** for Continue/Review.

### Multiplayer Flow
1. **Player 1** creates a game from landing page → enters game with new gameId
2. WebSocket connects to `/{gameId}/{userId}` → game auto-starts: tiles drawn, rack filled, `newGame` broadcast
3. **Player 2** opens invite link (`?game=abc123`) → joins same room (landing page skipped)
4. Server sends `playerJoined` to Player 1, `joinedExistingGame` to Player 2
5. Player 1 re-sends `newGame` (with their drawn tiles) to sync the late joiner
6. Player 2 receives `newGame` → `syncNewGame` deducts Player 1's tiles from bags, sets `needsInitialDraw` → `useGameSync` auto-draws Player 2's tiles and broadcasts `drewTiles`
7. Both players now have full racks. Players alternate turns, broadcasting `turn` messages with word positions and scores
8. Game ends when:
   - Tile bag exhausted + player's rack empty → `gameOverReason = 'tilesOut'`
   - 4 consecutive passes/swaps (2 per player) → `gameOverReason = 'consecutivePasses'`
9. Winner determined by score; `gameOver` message syncs result
10. Game-over overlay can be closed to inspect the final board + turn history without refreshing

### Multiplayer Resume + Review
1. Multiplayer clients persist debounced snapshots via `useGameSnapshotSync` (`stateSnapshot` WebSocket message).
2. Server stores snapshots in SQLite per `(games_row_id, user_id)`.
3. On multiplayer entry, `App.js` loads `/api/games/:gameId?userId=...` and hydrates Redux via `hydrateGameSnapshot` when snapshot data is available.
4. Landing-page **My Games** list enables:
   - **Continue** in-progress games without manually re-entering code.
   - **Review** finished games in read-only `GameReviewViewer` (turn slider + Jump controls).

### Invite System
- Creating an invited game sets `?invite=1` and opens invite modal automatically after game entry
- Invite modal supports:
  - Copy **game code** only
  - Copy full **invite link** (`{origin}?game={gameId}`)
  - Native share sheet (`navigator.share`) when available
- Landing page join accepts either code or full invite URL for consistency

## Game Rules (as shown in help modal)

1. **Goal**: Form valid Tamil words on the board to score points. Highest score wins.
2. **Tiles**: 4 types — Vowels (உயிர்), Consonants (மெய்), Combined (உயிர்மெய்), Bonus (மாயம்).
3. **Forming Words**: Place tiles in a single row or column. The first word must cover one of the 5 star squares. After that, new words can either connect to existing words or cover a star square.
4. **Combining Letters**: Drag vowel onto consonant (or vice versa) to form combined letter. Double-click to split back.
5. **Bonus Tile**: Can represent any letter. Double-click to choose.
6. **Scoring**: Tile points × letter multipliers × word multipliers. Star squares give 2× word score.
7. **Swapping**: Click swap → select tiles → click swap again to exchange with bag.
8. **Passing**: Skip your turn. If both players pass/swap twice in a row, game ends.

## Implementation Status

### Completed Features
- [x] **Landing page**: Game title, logo slot, persistent username, private/random/AI modes, join by code or link, help modal, language toggle
- [x] **Random matchmaking**: queue-based matching with join/status/cancel REST endpoints
- [x] **Persistent profiles**: username saved locally and synced to server `players` table
- [x] **Leaderboard/rating**: persistent Elo-style rating + win/loss/draw stats via SQLite
- [x] 15×15 game board with multiplier squares (Word2×, Word3×, Letter2×, Letter3×, Star)
- [x] Drag-and-drop tile placement (desktop and touch)
- [x] Tamil tile system with Mey/Uyir/Uyirmey/Bonus support
- [x] Tile merging (Mey + Uyir → Uyirmey) and splitting (double-click)
- [x] Word validation (placement rules, connectivity, star square rules)
- [x] Score calculation with all multiplier types
- [x] 14-slot player rack with shuffle
- [x] Bonus tile letter selection modal
- [x] Redux state management (5 slices, 29 actions; includes snapshot hydration)
- [x] New game initialization with confirmation dialog
- [x] Auto-start on game creation: tiles drawn automatically when creating a game; late-joining players also get auto-drawn tiles via re-sync
- [x] Landing-page My Games list: continue in-progress games + review finished games
- [x] Closeable game-over modal: users can dismiss overlay and inspect final board/history
- [x] Resumable multiplayer snapshots persisted in SQLite + restored on re-entry
- [x] **Room-based multiplayer**: gameId in URL, 2-player rooms, invite links
- [x] **WebSocket server**: turn, newGame, drewTiles, swapTiles, passTurn, gameOver, chat
- [x] **WebSocket client**: auto-reconnect, request-response pattern, chat
- [x] **Server hardening**: origin validation, rate limiting, message size, IP limits
- [x] **Chat UI**: real-time messages with timestamps, 500-char limit
- [x] **Invite system**: auto-open invite modal after new invited game; copy code, copy link, and native share support
- [x] LetterBags UI: remaining tile counts with Tamil-only labels (மெய், உயிர், மாயம்)
- [x] TurnHistory UI: move history with words, scores, passes, and swaps (including swapped tile count)
- [x] ScoreBoard: role labels (You/Opponent) + usernames, scores, and turn indicator
- [x] ConnectionStatus: WebSocket connection state and whose turn it is
- [x] **Swap mode UX**: sticky swap button, auto-return board tiles, single-click selection, red border, cancel
- [x] **Pass Turn**: skip turn with confirmation dialog, broadcast to opponent
- [x] Game End Logic: consecutive passes/swaps (4 total) or tiles exhausted
- [x] **Game Over overlay**: translated scores, winner display, play-again prompt
- [x] **Dictionary Validation (client-side)**: 2.85M-word dictionary with binary search (<1ms lookup)
- [x] **Dictionary Build Pipeline**: Python scripts combining Tamil Lexicon + Wiktionary + ThamizhiMorph verbs + FST noun/adj/adv forms
- [x] **FST Form Generation**: Generates 1.16M noun inflections from 97K lemmas using foma/flookup
- [x] **Server-side FST Validation**: 11 core long-lived flookup processes by default (guesser models opt-in)
- [x] **Validation UI**: Async submit with spinner during server check, dictionary-loading toast, disabled Play until ready, error toasts for invalid words
- [x] **Bilingual UI**: Tamil/English language toggle across all components including landing page
- [x] **Help modal**: bilingual game instructions (8 sections), available on landing page and in-game
- [x] **Confirmation dialogs**: Pass turn and new game (when game in progress) require confirmation
- [x] **Tamil-inspired design**: peacock blue, vermilion, gold, teal, jade color scheme
- [x] **Deployment config**: PM2 + nginx + TLS setup with DEPLOY.md guide
- [x] **Analytics**: SQLite tracking for visits/games/turns with password-protected admin APIs (`/api/admin/*`)
- [x] **Geo analytics**: coarse Geo-IP enrichment for visits/profiles/games, hashed player IP tracking, and country breakdown admin endpoints
- [x] **Analytics Inspector UI**: `?analytics=1` view with summary cards, country breakdowns, game/user inspection, and board replay slider

- [x] **Single Player Mode**: Play vs Computer with client-side AI engine
  - Anchor-based word generation with dictionary prefix pruning (O(log 2.85M) per check)
  - Tamil MEY+UYIR tile merging for UYIRMEY combinations
  - Cross-word validation, score calculation with multipliers
  - 5s search budget + timeout-aware quick fallback search before swap/pass fallback
  - Server-assisted rescue validation: bounded unknown-word batches validated via HTTP FST and cached before retrying search
  - Adaptive swap strategy (2-4 tiles based on rack/bag state) with recent-signature avoidance to reduce repeated swap loops
  - UI adapts: "vs Computer" status, "Computer" name, no Chat/Invite, "Thinking..." indicator

### TODO
- [ ] Tile Bag Optimization: balance distribution for fun gameplay
- [ ] Rendering & Code Optimization

## Key Files for Common Tasks

### Adding a New Redux Action
1. Define action in `src/store/actions.js`
2. Add reducer case in relevant slice (e.g., `WordBoardSlice.js`)
3. Dispatch from component

### Adding a Translation Key
1. Add key to both `en` and `ta` objects in `src/context/LanguageContext.js`
2. Use via `const { t } = useLanguage()` then `t.keyName`
3. For language-conditional logic, destructure `language` too: `const { language, t } = useLanguage()`

### Modifying Board Layout
- Multiplier positions: `src/utils/squareMultipliers.js`
- Board rendering: `src/components/WordBoard.js`, `src/components/Square.js`

### Changing Tile Distribution
- Initial counts: `src/utils/initialLetterBags.js`
- Tile definitions: `src/utils/TileSet.js`

### Changing Colors
- Board squares, tiles, animations, rack, buttons: `src/styles/Styles.css`
- Score/status accent colors: inline styles in `ScoreBoard.js`, `ConnectionStatus.js`, `TurnHistory.js`
- Tile badges in LetterBags: inline styles in `LetterBags.js`
- Page background: `App.js` (wrapper div) and `Styles.css` (`.GameFrame`)
- Landing page: inline styles in `App.js` `LandingPage` component

### Rebuilding the Dictionary
1. (Optional) Regenerate FST forms: `cd wordlists && python3 generate_fst_forms.py`
2. Build combined dictionary: `cd wordlists && python3 build_dictionary.py`
3. Output: `public/tamil_dictionary.txt` (served to browser)

### Adding a New WebSocket Message Type
1. Add handler in `server/index.js` switch statement
2. For broadcast: use `broadcastToRoom(gameId, senderId, message)`
3. For unicast response: use `sendToClient(ws, message)`
4. For all-in-room (like chat): use `sendToAllInRoom(gameId, message)`
5. Add client handler in `WebSocketContext.js` `onmessage` switch
6. For request-response: use `sendRequest()` on client, match via `requestId`

### Styling
- Main styles: `src/styles/Styles.css`
- Validation toasts: `.ValidatingToast` (blue spinner), `.InvalidWordsToast` (red fade)
- Swap mode toast: `.ValidatingToast` with red `#C0392B` background, positioned below buttons
- Swap-selected tile: `.swap-selected` class (red border + box shadow)
- Activated tile (merge/split): `.activated` class (tilt-shaking + per-type darkening animation)
- Component-specific inline styles in respective component files
- Landing page styles: inline in `App.js` `LandingPage` component

### Branding
- **Logo**: Place `logo.png` in `public/` — appears on landing page (96px height, hides if missing)
- **HTML title**: `public/index.html` `<title>` tag
- **PWA manifest**: `public/manifest.json` — `short_name` and `name` fields
- **Domain**: runtime same-origin for frontend API/WS, and `ecosystem.config.js` / server env `ALLOWED_ORIGINS`

## Development Notes

### Environment Variables
- Frontend API/WS URL env vars are optional; routing is derived at runtime (`window.location`) with localhost dev fallback to port `8000`
- `server/.env` — Local server env file (auto-loaded by `server/index.js` when present). Use `server/.env.example` as template.
- `PORT` — Server port (default 8000, set in `server/.env` or environment)
- `ALLOWED_ORIGINS` — Comma-separated allowed origins for WebSocket connections (set in `server/.env`)
- `ANALYTICS_ADMIN_PASSWORD` — Required to enable protected analytics admin endpoints (`/api/admin/*`)
- `ANALYTICS_STORE_RAW_IP` — Set `false` to avoid storing raw visit IP in `visits.ip` (default `true`)
- `GEO_PROVIDER` — Geo lookup provider: `none` (default), `ipwhois`, or `ipapi`
- `GEO_LOOKUP_TIMEOUT_MS` — Geo lookup timeout in milliseconds (default `800`)
- `GEO_CACHE_TTL_MS` — In-memory geo cache TTL in milliseconds (default `86400000`)
- `GEO_IP_HASH_SALT` — Salt used for SHA-256 IP hashing stored in `players.last_seen_ip_hash`

### Server (`server/index.js`)
The server at `server/index.js` is an HTTP + WebSocket server on a single port:
1. **HTTP server** wraps the WebSocket server — serves gameplay REST APIs and protected analytics admin APIs
2. Accepts WebSocket connections at `/{gameId}/{userId}?name={username}` path (rejects malformed URLs)
3. Validates origin against `ALLOWED_ORIGINS` (permissive in dev when unset)
4. Enforces per-IP connection limits (max 10)
5. Manages rooms (Map of gameId → players Map, max 2 per room)
6. Broadcasts game messages to other players in the same room
7. Rate-limits messages (30/sec sliding window) and rejects oversized messages (>100KB)
8. Validates input per message type (chat text ≤ 500, validateWords ≤ 20, etc.)
9. Handles `validateWords` requests via FST process pool (unicast response)
10. Manages long-lived core `flookup` child processes with respawn on crash (guesser models optional via env)
11. Maintains random-opponent matchmaking queue (`/api/matchmaking/join|status|cancel`)
12. Stores persistent player profiles + leaderboard data (`players` table, `/api/profile`, `/api/leaderboard`)
13. **Hooks analytics** into game message handlers (newGame, turn, pass, swap, gameOver), including tile placement capture for board replay
14. Cleans up empty rooms after 5 minutes
15. Gracefully shuts down flookup processes, analytics DB, and HTTP server on SIGINT
16. Start with: `cd server && npm run setup && npm start`
17. Serves React static assets with HTTP cache headers and conditional request handling (`ETag` + `Last-Modified`): hashed build assets are immutable for 1 year, `tamil_dictionary.txt` is cached for 24h, and fresh conditional requests return `304 Not Modified`

### FST Models
- **Build-time** (`wordlists/fst-models/`): Used by `generate_fst_forms.py` to pre-generate noun inflections
- **Runtime** (`server/fst-models/`): Used by server's flookup processes for real-time validation
- Download commands: `cd wordlists && python3 generate_fst_forms.py` (build) or `cd server && npm run setup` (runtime)
- Source: `github.com/sarves/thamizhi-morph/FST-Models/`

### Dictionary Binary Search
The dictionary is sorted with Python's `sorted()` (Unicode codepoint order). The JavaScript binary search MUST use `<`/`>` operators, NOT `localeCompare()`. Locale-aware Tamil sorting differs from codepoint order and will cause lookup failures.

### User ID Persistence
User IDs are stored in cookies (`solladukku` cookie, 1-year TTL) for session persistence.

### Username Persistence
Usernames are stored in `localStorage` (`solladukku_username`) and synced to server with `POST /api/profile`.

### Deployment (Railway)
Deployed as a single Dockerfile-based service on Railway:
- `Dockerfile` builds the React frontend, then sets up the Node.js server
- Server serves the static React build for non-API routes + handles WebSocket/API on the same port
- Static file caching is handled in `server/index.js` (not nginx): `ETag`/`Last-Modified` are emitted and respected so unchanged assets (including `tamil_dictionary.txt`) are revalidated and not re-downloaded on refresh
- Auto-deploys on push to `main` (connected via GitHub integration)
- `railway.toml` `watchPatterns` limits rebuilds to code changes (skips doc-only commits)
- Custom domain: `solmaalai.com` (CNAME → Railway). `சொல்மாலை.com` redirects via Namecheap.
- `Dockerfile` installs `foma`/`flookup`; server-side FST validation is available in production when FST models are present under `server/fst-models/`
- Dictionary file (135MB) stored via Git LFS. Railway's Docker builder doesn't resolve LFS pointers, so the Dockerfile detects this (file < 1KB) and downloads the actual file from GitHub.
- Railway CLI: `railway up` for manual deploy, `railway logs` to check output

### Deployment (Legacy - Digital Ocean)
See `deploy/DEPLOY.md` for Digital Ocean deployment instructions:
- Ubuntu 22.04 droplet (2GB+ RAM for flookup processes)
- nginx serves React build as static files + reverse proxies `/ws/` to WebSocket server
- PM2 manages server process with auto-restart
- Let's Encrypt for TLS via certbot
- Dictionary file (~135MB) served with gzip compression (~25MB)

### Debugging
Console logs are present throughout for debugging. Key areas:
- `App.js`: Game creation and joining
- `ActionMenu.js`: Turn submission, validation flow, server fallback
- `WebSocketContext.js`: Message send/receive, request-response matching
- `dictionary.js`: Dictionary load, cache hits/misses
- `server/index.js`: FST validation requests and results, room management, rate limiting
- Redux slices: State updates
