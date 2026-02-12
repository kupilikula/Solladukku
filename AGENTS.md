# Solmaalai (சொல்மாலை) - Tamil Scrabble Game

A React-based Tamil Scrabble game with a landing page, real-time multiplayer via WebSockets, room-based game management, bilingual UI (Tamil/English), and two-tier word validation.

## Technology Stack

- **Frontend**: React 18.2.0 with Create React App
- **State Management**: Redux Toolkit (@reduxjs/toolkit 1.9.7)
- **Drag & Drop**: react-dnd v16.0.1 with HTML5 and Touch backends
- **Real-time**: WebSockets with room-based multiplayer (configurable via `REACT_APP_WS_URL` env var)
- **I18n**: React Context-based Tamil/English language toggle
- **UI**: react-icons, react-tooltip, react-select, react-fitty
- **Server**: Node.js with ws library, foma/flookup for FST validation, origin/rate-limit hardening, SQLite analytics
- **Dictionary Build**: Python 3 scripts, foma toolkit for FST morphological generation
- **Deployment**: Railway (Dockerfile-based, auto-deploy on push to `main`). Server serves both API/WebSocket and React static build as a single service.
- **Dictionary Storage**: Git LFS (135MB file exceeds GitHub's 100MB limit)

## Project Structure

```
deploy/
├── nginx.conf                # nginx config (static files + WebSocket proxy + gzip + TLS)
└── DEPLOY.md                 # Step-by-step deployment guide for Digital Ocean
server/
├── index.js                  # HTTP + WebSocket server: rooms, hardening, FST validation, REST API
├── analytics.js              # SQLite analytics: visits, games, turns tracking
├── download-fsts.js          # Script to download FST models from ThamizhiMorph
├── package.json              # Server deps (ws, better-sqlite3); scripts: start, setup
├── analytics.db              # SQLite database (auto-created, gitignored)
└── fst-models/               # Runtime FST model files (16 .fst files)
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
├── App.js                    # Landing page + game entry: userId, gameId, conditional routing
├── context/
│   ├── WebSocketContext.js   # WebSocket: room connection, chat, sendRequest (req-response)
│   └── LanguageContext.js    # Tamil/English toggle with 50+ translation keys
├── hooks/
│   └── useGameSync.js        # Game state sync hook (auto-start, initial draw, game-over detection)
├── components/
│   ├── GameFrame.js          # Main layout + GameOverOverlay (translated, peacock blue accent)
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
│   ├── TurnHistory.js        # Move history with words, scores, passes, swaps
│   ├── ConnectionStatus.js   # WebSocket status + turn indicator
│   ├── Chat.js               # Real-time player chat (500 char limit, timestamps)
│   └── ChooseLetter.js       # Modal for bonus tile letter selection
├── store/
│   ├── store.js              # Redux store configuration (5 reducers)
│   ├── actions.js            # 28 action creators
│   ├── WordBoardSlice.js     # Board tile state (played + unplayed positions)
│   ├── LetterRackSlice.js    # Player rack state (14 slots, swap/shuffle/split)
│   ├── ScoreBoardSlice.js    # Scores, turn history, multiplier calculations
│   ├── GameSlice.js          # Game metadata: userId, gameId, swapMode, turn tracking
│   └── LetterBagsSlice.js    # Tile bag inventory (vowels, consonants, bonus)
├── utils/
│   ├── TileSet.js            # Tamil tile definitions (points, types, merge/split ops)
│   ├── constants.js          # Game constants and helpers
│   ├── dictionary.js         # Dictionary loader, binary search, server validation cache
│   ├── initialLetterBags.js  # Initial tile distribution counts
│   └── squareMultipliers.js  # 15×15 board multiplier map
└── styles/
    └── Styles.css            # All component styles, animations, toasts
.env                          # Dev defaults (REACT_APP_WS_URL=ws://localhost:8000)
.env.production               # Production config (REACT_APP_WS_URL=wss://DOMAIN/ws)
ecosystem.config.js           # PM2 process manager config (legacy DO deploy)
Dockerfile                    # Combined build: React frontend + Node.js server
.dockerignore                 # Excludes node_modules, env files, wordlists from Docker context
railway.toml                  # Railway deploy config: watchPatterns to skip doc-only builds
```

## Landing Page (`src/App.js`)

The app opens to a landing page before entering any game:

- **Game title**: "சொல்மாலை" in large peacock blue text
- **Logo**: Renders `public/logo.png` above the title (96px height). Hides gracefully via `onError` if the file is missing.
- **"Create Game" button**: Generates a 6-char gameId, sets `?game=` in URL, enters the game
- **"Join Game" section**: Text input for a game code (4-8 alphanumeric chars) + join button. Validates input, shows error for invalid codes. Supports Enter key.
- **"Game Rules" link**: Opens help modal with bilingual game instructions (same content as in-game help)
- **Language toggle**: Top-right corner ("EN" / "த"), shared with in-game toggle via LanguageContext

**Invite link bypass**: If someone arrives via `?game=XYZ` URL, the landing page is skipped entirely — they go straight into the game. The WebSocket connection is only established after entering a game.

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
  └─ NOT FOUND → send 'validateWords' to server via WebSocket
                    ├─ Server runs flookup against 16 FST models in parallel
                    ├─ ANY FST recognizes word → valid
                    └─ Returns 'validateWordsResult' (unicast to requester only)
                  Client caches result → accept or reject
```

### Client-Side Dictionary

- **File**: `public/tamil_dictionary.txt` — 2.85M words, sorted (Unicode codepoint order)
- **Loaded** on app startup via `loadDictionary()` in `src/utils/dictionary.js`
- **Lookup**: Binary search using `<`/`>` comparison (NOT `localeCompare` — must match Python's `sorted()` codepoint order)
- **Permissive fallback**: If dictionary fails to load, all words are accepted

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

- **16 long-lived `flookup` child processes** (one per FST model), stdin/stdout pipes kept open
- **FIFO callback queue** per process for concurrent lookups
- **Parallel validation**: word checked against all FSTs simultaneously, accepted if ANY recognizes it
- **Respawn logic**: crashed processes restart after 5s delay, max 3 attempts
- **Permissive fallbacks**: flookup not installed → accept; FST models missing → accept; timeout → accept
- **Request-response pattern**: `requestId` field matches requests to responses (unicast, not broadcast)

### Server Validation Cache (`src/utils/dictionary.js`)

- Session-level `Map<word, boolean>` — same word never re-queried
- Checks cache before sending to server
- Permissive on timeout (5s) or disconnect

### Validation UI (`src/components/ActionMenu.js`)

- `isValidating` state prevents double-submission during server check
- Blue `.ValidatingToast` with spinner shown during server validation
- Red `.InvalidWordsToast` shown for rejected words (auto-fades after 3s)

## Analytics System

### Overview

Server-side analytics using SQLite (`better-sqlite3`) with a REST API. The HTTP server and WebSocket server share the same port. Game events are captured server-side by intercepting existing WebSocket messages — no new message types needed.

### Database (`server/analytics.db`)

Three tables with WAL mode enabled:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `visits` | Page view tracking | `page` ('landing'\|'game'), `game_id`, `user_id`, `ip`, `user_agent`, `referrer` |
| `games` | One row per game session | `game_id`, `player1_id`, `player2_id`, scores, `winner_id`, `game_over_reason`, `total_turns` |
| `turns` | One row per turn action | `game_id`, `games_row_id` (FK), `user_id`, `turn_type` ('word'\|'pass'\|'swap'), `score`, `words_played` (JSON), `tiles_placed` |

### REST API Endpoints

All endpoints served on the same port as WebSocket (default 8000). CORS uses the same `ALLOWED_ORIGINS` config.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/visit` | Record a page visit (`{page, gameId, userId}`) |
| `GET` | `/api/stats` | Aggregate counts (visits, games, completed, turns) |
| `GET` | `/api/games?limit=N` | Recent games list (default 20, max 100) |
| `GET` | `/api/games/:gameId` | Game detail with all turns |
| `GET` | `/api/visits/daily?days=N` | Daily visit breakdown (default 30, max 365) |

### Server-Side Event Hooks

Analytics calls are added **after** existing `broadcastToRoom` calls — no change to game behavior:

| WebSocket Message | Analytics Action |
|------------------|-----------------|
| `newGame` | `startGame()` + `setPlayer2()` if opponent in room |
| Player joins (non-reconnection) | `setPlayer2()` if active game exists |
| `turn` | `recordTurn()` with type 'word', score, formed words |
| `passTurn` | `recordTurn()` with type 'pass' |
| `swapTiles` | `recordTurn()` with type 'swap' |
| `gameOver` | `endGame()` with winner resolution and reason |

### Client-Side Visit Tracking (`src/App.js`)

- `getApiBaseUrl()` derives HTTP URL from `REACT_APP_WS_URL` if set, otherwise uses `window.location.origin`
- Landing page: fire-and-forget POST on mount (`page: 'landing'`)
- Game entry: fire-and-forget POST when `gameId` is set (`page: 'game'`, with `gameId` and `userId`)

## Redux Store Structure

### GameSlice
```javascript
{
  userId: string,              // Current player's UUID (persisted in 'solladukku' cookie)
  gameId: string,              // Room identifier from URL ?game= param
  otherPlayerIds: string[],    // Other players in the game
  currentTurnUserId: string,   // Whose turn it is
  isMyTurn: boolean,           // Whether it's this player's turn
  gameStarted: boolean,        // Whether the game has started
  needsInitialDraw: boolean,   // Flag to trigger tile draw after sync
  autoStartPending: boolean,   // Flag to auto-start game after WS connects (set on Create Game)
  myInitialDraw: string[],     // Tiles drawn at game start (for re-syncing late joiners)
  playerNames: {               // Map of userId to display name
    [userId]: string
  },
  consecutivePasses: number,   // Track consecutive passes/swaps (game ends at 4)
  gameOver: boolean,           // Is the game over?
  winner: string | null,       // Winner's userId, 'opponent', or 'tie'
  gameOverReason: string | null, // 'tilesOut' or 'consecutivePasses'
  swapMode: boolean,           // Whether swap tile selection mode is active
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

Normal mode (left to right): **Pass** | **Swap** | **Return** | **Shuffle** | **Play** | **Help** | **Invite** | **New Game**

Swap mode: Only **Swap** (red confirm) and **Cancel** buttons visible.

### Confirmation Dialogs
- **Pass Turn**: Shows bilingual confirmation dialog before passing
- **New Game**: Shows confirmation dialog if a game is currently in progress (`gameStarted && !gameOver`). Starts immediately if no game is active.

## WebSocket Protocol

### Connection
```
{WS_BASE_URL}/{gameId}/{userId}
```

Where `WS_BASE_URL` comes from `REACT_APP_WS_URL` env var. In production (HTTPS), the URL is auto-derived from `window.location` if the env var is not set.

The WebSocket connection is managed via React Context (`WebSocketContext.js`), providing:
- Auto-reconnect on disconnect (3-second delay)
- Connection state tracking (`isConnected`, `connectionError`)
- `sendTurn(turnInfo)` — broadcast turn to other players in room
- `sendMessage(message)` — generic fire-and-forget broadcast to room
- `sendRequest(message, timeoutMs)` — request-response with `requestId` matching, returns Promise
- `sendChat(text)` — send chat message (trimmed to 500 chars)
- `chatMessages` state — array of `{userId, text, timestamp}` objects

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

**Server → Client Messages**

| Type | Direction | Description |
|------|-----------|-------------|
| `playerJoined` | server→all | New player joined room |
| `joinedExistingGame` | server→joiner | You joined an existing game |
| `roomState` | server→client | Reconnection: current room state |
| `playerLeft` | server→all | Player disconnected |

**Request-Response Messages (client → server → same client)**

| Type | Direction | Description |
|------|-----------|-------------|
| `validateWords` | client→server | Words to validate via FST (`requestId`, `words[]`, max 20) |
| `validateWordsResult` | server→client | Validation results (`requestId`, `results: {word: bool}`) |

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

**UI Labels**: `you`, `opponent`, `yourTurn`, `waiting`, `connected`, `disconnected`, `connectionFailed`, `tilesRemaining`, `total`, `tiles`, `turnHistory`, `noMovesYet`, `chat`, `noMessagesYet`, `typeMessage`, `send`, `turn`, `passed`, `swappedTiles`

**Landing Page**: `tagline`, `createGame`, `joinGame`, `enterGameCode`, `join`, `howToPlay`, `invalidCode`

**Help Modal**: `helpTitle` ("Game Rules" / "விளையாட்டு முறை"), `helpClose`, `helpSections` (array of 8 `{title, body}` objects covering: Goal, Tiles, Forming Words, Combining Letters, Bonus Tile, Scoring, Swapping Tiles, Passing)

**Confirmation Dialogs**: `confirmNewGame`, `confirmPass`, `yes`, `no`

**Game Over**: `gameOverTie`, `gameOverWon`, `gameOverLost`, `gameOverPasses`, `gameOverTilesOut`, `gameOverNewGame`, `vs`

### Components Using Translations
- `App.js` — landing page: title, create/join, help modal, language toggle
- `ScoreBoard.js` — player names (`t.you`, `t.opponent`), turn badge (`t.turn`)
- `ConnectionStatus.js` — status text, turn indicator
- `TurnHistory.js` — header, empty state, pass/swap labels
- `LetterBags.js` — header, total label (tile type labels are Tamil-only: மெய், உயிர், மாயம்)
- `Chat.js` — header, empty state, input placeholder, send button
- `GameFrame.js` — GameOverOverlay result/reason text, player labels
- `ActionMenu.js` — swap mode toast, HelpModal content, ConfirmDialog text

## User Flow

### Landing Page → Game Entry
1. User visits the app → sees landing page with "சொல்மாலை" title
2. **Create Game**: Click button → generates 6-char gameId → enters game
3. **Join Game**: Enter code → validates (4-8 alphanum) → enters game
4. **Invite link** (`?game=XYZ`): Bypasses landing page → enters game directly

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

### Invite System
- Invite button in ActionMenu copies `{origin}?game={gameId}` to clipboard
- "Link copied!" toast confirms (auto-fades after 2s)
- No router needed — `?game=` query param with `history.replaceState`

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
- [x] **Landing page**: Game title, logo slot, create/join game, help modal, language toggle
- [x] 15×15 game board with multiplier squares (Word2×, Word3×, Letter2×, Letter3×, Star)
- [x] Drag-and-drop tile placement (desktop and touch)
- [x] Tamil tile system with Mey/Uyir/Uyirmey/Bonus support
- [x] Tile merging (Mey + Uyir → Uyirmey) and splitting (double-click)
- [x] Word validation (placement rules, connectivity, star square rules)
- [x] Score calculation with all multiplier types
- [x] 14-slot player rack with shuffle
- [x] Bonus tile letter selection modal
- [x] Redux state management (5 slices, 28 actions)
- [x] New game initialization with confirmation dialog
- [x] Auto-start on game creation: tiles drawn automatically when creating a game; late-joining players also get auto-drawn tiles via re-sync
- [x] **Room-based multiplayer**: gameId in URL, 2-player rooms, invite links
- [x] **WebSocket server**: turn, newGame, drewTiles, swapTiles, passTurn, gameOver, chat
- [x] **WebSocket client**: auto-reconnect, request-response pattern, chat
- [x] **Server hardening**: origin validation, rate limiting, message size, IP limits
- [x] **Chat UI**: real-time messages with timestamps, 500-char limit
- [x] **Invite system**: copy game link to clipboard
- [x] LetterBags UI: remaining tile counts with Tamil-only labels (மெய், உயிர், மாயம்)
- [x] TurnHistory UI: move history with words, scores, passes, and swaps
- [x] ScoreBoard: player names (You/Opponent), scores, and turn indicator
- [x] ConnectionStatus: WebSocket connection state and whose turn it is
- [x] **Swap mode UX**: sticky swap button, auto-return board tiles, single-click selection, red border, cancel
- [x] **Pass Turn**: skip turn with confirmation dialog, broadcast to opponent
- [x] Game End Logic: consecutive passes/swaps (4 total) or tiles exhausted
- [x] **Game Over overlay**: translated scores, winner display, play-again prompt
- [x] **Dictionary Validation (client-side)**: 2.85M-word dictionary with binary search (<1ms lookup)
- [x] **Dictionary Build Pipeline**: Python scripts combining Tamil Lexicon + Wiktionary + ThamizhiMorph verbs + FST noun/adj/adv forms
- [x] **FST Form Generation**: Generates 1.16M noun inflections from 97K lemmas using foma/flookup
- [x] **Server-side FST Validation**: 16 long-lived flookup processes for real-time word validation via WebSocket
- [x] **Validation UI**: Async submit with spinner during server check, error toasts for invalid words
- [x] **Bilingual UI**: Tamil/English language toggle across all components including landing page
- [x] **Help modal**: bilingual game instructions (8 sections), available on landing page and in-game
- [x] **Confirmation dialogs**: Pass turn and new game (when game in progress) require confirmation
- [x] **Tamil-inspired design**: peacock blue, vermilion, gold, teal, jade color scheme
- [x] **Deployment config**: PM2 + nginx + TLS setup with DEPLOY.md guide
- [x] **Analytics**: SQLite tracking for visits, games, and turns with REST API on same port as WebSocket

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
- **Domain**: `.env.production` `REACT_APP_WS_URL` and `ecosystem.config.js` `ALLOWED_ORIGINS`

## Development Notes

### Environment Variables
- `REACT_APP_WS_URL` — WebSocket server URL (set in `.env` for dev, `.env.production` for prod)
- `PORT` — Server port (default 8000, set in `server/.env` or environment)
- `ALLOWED_ORIGINS` — Comma-separated allowed origins for WebSocket connections (set in `server/.env`)

### Server (`server/index.js`)
The server at `server/index.js` is an HTTP + WebSocket server on a single port:
1. **HTTP server** wraps the WebSocket server — serves REST API for analytics
2. Accepts WebSocket connections at `/{gameId}/{userId}` path (rejects malformed URLs)
3. Validates origin against `ALLOWED_ORIGINS` (permissive in dev when unset)
4. Enforces per-IP connection limits (max 10)
5. Manages rooms (Map of gameId → players Map, max 2 per room)
6. Broadcasts game messages to other players in the same room
7. Rate-limits messages (30/sec sliding window) and rejects oversized messages (>100KB)
8. Validates input per message type (chat text ≤ 500, validateWords ≤ 20, etc.)
9. Handles `validateWords` requests via FST process pool (unicast response)
10. Manages 16 long-lived `flookup` child processes with respawn on crash
11. **Hooks analytics** into game message handlers (newGame, turn, pass, swap, gameOver)
12. Cleans up empty rooms after 5 minutes
13. Gracefully shuts down flookup processes, analytics DB, and HTTP server on SIGINT
14. Start with: `cd server && npm run setup && npm start`

### FST Models
- **Build-time** (`wordlists/fst-models/`): Used by `generate_fst_forms.py` to pre-generate noun inflections
- **Runtime** (`server/fst-models/`): Used by server's flookup processes for real-time validation
- Download commands: `cd wordlists && python3 generate_fst_forms.py` (build) or `cd server && npm run setup` (runtime)
- Source: `github.com/sarves/thamizhi-morph/FST-Models/`

### Dictionary Binary Search
The dictionary is sorted with Python's `sorted()` (Unicode codepoint order). The JavaScript binary search MUST use `<`/`>` operators, NOT `localeCompare()`. Locale-aware Tamil sorting differs from codepoint order and will cause lookup failures.

### User ID Persistence
User IDs are stored in cookies (`solladukku` cookie, 6-year TTL) for session persistence.

### Deployment (Railway)
Deployed as a single Dockerfile-based service on Railway:
- `Dockerfile` builds the React frontend, then sets up the Node.js server
- Server serves the static React build for non-API routes + handles WebSocket/API on the same port
- Auto-deploys on push to `main` (connected via GitHub integration)
- `railway.toml` `watchPatterns` limits rebuilds to code changes (skips doc-only commits)
- Custom domain: `solmaalai.com` (CNAME → Railway). `சொல்மாலை.com` redirects via Namecheap.
- FST validation is disabled in production (flookup not available in container) — client-side dictionary still validates
- Dictionary file (135MB) stored via Git LFS
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
