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
- **Server**: Node.js with ws library, foma/flookup for FST validation, origin/rate-limit hardening, SQLite analytics, and feature-flagged account auth (access token + HttpOnly refresh cookie sessions, double-submit CSRF token cookie/header protection for cookie-auth routes, Argon2id password hashing via `argon2`), plus Zoho SMTP email delivery integration via `nodemailer` for verification/reset flows
- **Dictionary Build**: Python 3 scripts, foma toolkit for FST morphological generation
- **Deployment**: Railway (Dockerfile-based, auto-deploy on push to `main`). Server serves both API/WebSocket and React static build as a single service.
- **Dictionary Storage**: Git LFS (135MB file exceeds GitHub's 100MB limit). Dockerfile auto-downloads from GitHub if LFS pointer isn't resolved.

## Project Structure

```
deploy/
├── nginx.conf                # nginx config (static files + WebSocket proxy + gzip + TLS)
└── DEPLOY.md                 # Step-by-step deployment guide for Railway
Docs/
├── README.md                 # Docs index and navigation
├── FST_ARCHITECTURE.md       # Canonical FST source/build/patch/deploy architecture
└── WORD_VALIDATION_PLAN.md   # Canonical word-validation research and phased plan
server/
├── index.js                  # HTTP + WebSocket server: rooms, hardening, FST validation, REST API
├── analytics.js              # SQLite analytics: visits, games, turns tracking
├── auth.js                   # Auth helpers: access/refresh tokens, password hashing, cookie/session utilities
├── geo.js                    # Geo-IP resolver (provider + cache + IP hashing)
├── download-fsts.js          # Backward-compatible setup wrapper that runs deterministic vendored FST build
├── package.json              # Server deps (ws, better-sqlite3); scripts: start, setup, test
├── test/
│   └── auth-integration.test.js # Node integration tests: auth lifecycle, /api/games authz, WS auth close codes
├── analytics.db              # SQLite database (auto-created, gitignored)
└── fst-models/               # Runtime FST model files (11 core models)
static-word-list/
├── build_dictionary.py       # Builds combined dictionary from all sources
├── generate_fst_forms.py     # Generates noun/adj/adv inflections via local built flookup models
├── tamillexicon_headwords.txt # Tamil Lexicon source headwords (107K)
├── fst_generated_forms.txt   # Output: generated FST surface forms (count depends on current model build)
├── cache/                    # Cached downloads (verb files, Wiktionary TSV)
└── fst-models/               # Synced FST consumer copy for dictionary tooling compatibility
build/
└── fst-models/               # Canonical generated FST artifacts (synced to server/static-word-list)
fst/
├── README.md                 # Vendored upstream + patch/build/test workflow documentation
├── patches/                  # Ordered local source patches applied to upstream foma sources
├── build/
│   ├── build_fsts.py         # Deterministic extractor/patcher/compiler/copier + manifest generator
│   └── manifest.json         # Last build metadata: submodule commit, patch hashes, output checksums
├── reports/                  # Analysis outputs, including upstream-vs-patched diff audits
│   ├── THAMIZHIMORPH_FST_AUDIT.md      # Prior single-build audit report
│   ├── THAMIZHIMORPH_FST_AUDIT_DIFF.md # Differential audit: upstream vs Solmaalai patched
│   ├── THAMIZHIMORPH_FST_SHORTCOMINGS.md # Patch-discovery audit over shipped models
│   ├── NOUN_CLASS_DUPLICATES.md         # Noun class duplication audit (baseline vs patched)
│   └── artifacts/
│       ├── diff/             # Diff harness + generated upstream/patched artifacts and TSVs
│       └── shortcomings/     # Shortcomings harness + probe outputs + golden probes
└── tests/
    ├── run_fst_regressions.py # CI-friendly morphology + dictionary regression checks
    ├── analyze_fst.py        # Audit harness for suspicious pattern and coverage analysis
    ├── config/               # Analysis config presets (nouns, verbs)
    └── fixtures/             # known-good/known-bad/regression fixtures
vendor/
└── thamizhi-morph/           # Git submodule pinned to upstream commit (currently a296417ac603fd44eda35645369f1257d96bed89)
public/
├── logo.png                  # Game logo (optional — landing page hides slot if missing)
├── tamil_dictionary.txt      # Generated Tamil dictionary served to browser (size/count depends on latest build)
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
│   └── useSoloGamePersistence.js # Single-player DB persistence (start/turn/end/snapshot) for My Games continue/final-board view
├── components/
│   ├── AuthPanel.js          # Landing-page auth panel: login/signup (with explicit signup username) + verify-email + forgot/reset password
│   ├── AnalyticsViewer.js    # Password-protected analytics inspector (`?analytics=1`) with session-cached admin header, visible API error messaging, board replay fallback from formed-word tile coordinates, and per-turn Jump controls
│   ├── GameFrame.js          # Main layout: top branded Home link, SinglePlayer/Multiplayer wrappers + GameOverOverlay
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
│   ├── authClient.js         # Auth API client (`/api/auth/*`) with credentialed refresh-cookie requests
│   ├── authSession.js        # In-memory access-token holder shared by app/hooks for authenticated API writes
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
.dockerignore                 # Excludes node_modules, env files, static-word-list from Docker context
railway.toml                  # Railway deploy config: watchPatterns to skip doc-only builds
```

## Landing Page (`src/App.js`)

The app opens to a landing page before entering any game:

- **Game title**: "சொல்மாலை" in large peacock blue text
- **Logo**: Renders `public/logo.png` above the title (96px height). Hides gracefully via `onError` if the file is missing.
- **Persistent username**: Editable username input (saved in `localStorage` and synced to server profile)
- **Account auth panel (feature-flagged)**: Landing page supports login/signup plus verify-email and forgot/reset password flows; signup includes an explicit username field in the auth card. By default only **Forgot Password** selector is shown; **Reset Password** and **Verify Email** selectors appear only when arriving via `/reset-password?token=...` or `/verify-email?token=...` links. Verify links auto-submit once; reset links auto-select reset mode and reuse URL token (manual token input only when token is missing). When auth is enabled, access token is kept in-memory, refresh session uses HttpOnly cookie, and CSRF token is sent via `X-CSRF-Token` from `solmaalai_csrf` cookie.
- **Refresh bootstrap dedupe**: Client auth API deduplicates `/api/auth/refresh` calls in two ways: concurrent callers share one in-flight request, and immediate follow-up calls within a short window reuse the most recent refresh result. This prevents React Strict Mode double-mount behavior from issuing duplicate refresh network calls and avoids stale `401` follow-ups overriding a successful restore on landing or game-page reloads.
- **Solo mode detection in Redux**: `storeUserId` now normalizes `gameId` case-insensitively, so uppercase `SOLO-*` ids are always classified as `singleplayer` (instead of falling back to `multiplayer`). This keeps solo UI state correct, including ConnectionStatus showing `vs Computer` instead of disconnected WebSocket status.
- **Identity header**: Displays guest/authenticated status with logout action for signed-in accounts
- **Auth panel visibility**: Login/Signup/Forgot/Reset/Verify auth card now renders only for guests (`!authAccount`). Signed-in users only see the identity header + logout UI.
- **Username gate**: If `/api/profile` reports username conflict (`409`), game entry actions are disabled until user picks an available name
- **"New Game With Invited Opponent" button** (`புது ஆட்டம் அழைப்புடன்`): Creates a private multiplayer room, sets `?game=` in URL, and auto-opens invite modal in-game
- **"Play Random Opponent" button** (`யாவொருவருடன் விளையாடு`): Joins queue-based matchmaking; on match, navigates to matched `gameId`
- **"Play vs Computer" button**: Starts a single-player game against the AI (no WebSocket, no game code needed)
- **"Join Private Game" section**: Accepts either room code (4-8 alphanumeric, canonical uppercase) or full invite URL containing `?game=...`
- **Leaderboard card**: Shows top rated players when data exists (hidden when empty), fetched with landing-page limit `10`, and stays visible on desktop via sticky positioning
- **My Games card**: Authenticated users get account-scoped games across linked devices/browsers (with guest fallback when needed); supports **Continue** for in-progress games and **View Final Board** for finished games, includes status filter (All/In Progress/Finished), sort (Recent/Oldest), finished-games collapse toggle, and desktop internal scrolling (max-height) so long lists do not push leaderboard below the fold
- **Solo ownership resilience**: If a solo game is created before bearer auth is available, later authenticated solo turn/snapshot writes now backfill `games.account_id`, and account-scoped game queries also consider authenticated turn/snapshot ownership. This keeps solo games visible in My Games for signed-in users.
- **"Game Rules" link**: Opens help modal with bilingual game instructions (same content as in-game help)
- **Language toggle**: Top-right corner ("EN" / "த"), shared with in-game toggle via LanguageContext
- **Landing layout (desktop)**: Two-column composition — left column prioritizes game actions and places a horizontally-centered Leaderboard directly below those actions, with matching card width between the actions card and leaderboard card; right column contains account/auth card and My Games. Desktop columns align to matching bottom edges using measured left-column height with a minimum desktop floor so My Games can show ~4-5 rows before scrolling internally. On mobile, sections stack into a single-column flow.

**URL game bypass**: If someone arrives via `?game=XYZ` (multiplayer) or `?game=SOLO-...` (single-player), the landing page is skipped entirely and the app attempts direct game resume.
The WebSocket connection is only established for multiplayer entries.
- **In-game Home navigation**: Game page shows a compact top bar with optional logo + "சொல்மாலை" title and a branded clickable link that returns to landing by clearing query params (navigates to current pathname) without an additional confirmation prompt.
- **Fresh solo start guard**: Clicking **Play vs Computer** now skips the `/api/games/:gameId` resume fetch for newly generated `SOLO-*` ids and only runs resume-detail fetches when resume mode is active (URL-resume or My Games Continue). This avoids transient first-click `403` responses before `/api/solo/start` persists the new solo game row.
- **Access guard on shared links**:
  - Solo links are account/user scoped (`/api/games/:gameId?userId=...` with account-first authorization). If an unauthenticated user opens a protected solo link and initial resume receives access denial (`401`/`403`/`404`), the app clears `?game`, returns to landing, prompts login, and retries the same link once after successful login.
  - If a foreign profile/session still fails authorization after retry (or an already-authenticated user opens a foreign solo link and gets `403`/`404`), the app clears `?game`, returns to landing, and shows "link not available for this user session" instead of silently starting a fresh game with the same code.
  - Multiplayer links remain joinable by other users, but if the room is already full (3rd join attempt), the server rejects with WebSocket close code `4001`; the client now exits to landing and shows a localized room-full message.

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
                    └─ ANY FST recognizes word → valid
                  Client caches result → accept or reject
```

### Client-Side Dictionary

- **File**: `public/tamil_dictionary.txt` — generated word list, sorted (Unicode codepoint order)
- **Loaded** on app startup via `loadDictionary()` in `src/utils/dictionary.js`
- **Client persistence**: `loadDictionary()` now caches the dictionary text in IndexedDB (`solmaalai-cache/assets`) and reuses it on refresh to avoid repeated 135MB downloads (including private/incognito sessions while storage remains available)
- **Gameplay guard**: Play submission is blocked until dictionary load completes (loading toast + disabled Play button)
- **Lookup**: Binary search using `<`/`>` comparison (NOT `localeCompare` — must match Python's `sorted()` codepoint order)
- **Permissive fallback**: If dictionary fails to load or is too small (< 1000 entries, e.g. LFS pointer), all words are accepted
- **Cache invalidation knob**: `REACT_APP_DICTIONARY_CACHE_VERSION` (frontend build env) can be bumped when dictionary content changes to force a one-time refetch

### Dictionary Sources (built by `static-word-list/build_dictionary.py`)

| Source | Words | Description |
|--------|-------|-------------|
| Tamil Lexicon headwords | 106K | Classical Tamil headwords from University of Madras |
| Vuizur Wiktionary TSV | 5.5K | Modern Tamil headwords from Wiktionary |
| ThamizhiMorph Generated-Verbs | 1.69M | Pre-generated verb inflections (18 conjugation classes) |
| FST-generated forms | Build-dependent | Noun inflections (case × number), adjectives, adverbs |
| **Total (deduplicated)** | **Build-dependent** | Filtered to ≤15 Tamil letters |

### FST Form Generation (`static-word-list/generate_fst_forms.py`)

1. Uses canonical built FST models from `build/fst-models/` (built by `npm run fst:build`)
2. Feeds 116K Tamil Lexicon headwords through forward `flookup` to identify recognized nouns
3. Generates all inflected forms via inverse `flookup -i` with morphological tags:
   - `noun.fst`: 16 tags (nom/acc/dat/loc/abl/gen/inst/soc × sg/pl)
4. Also processes adj, adv, part, pronoun FSTs for forward recognition
5. Requires: `foma`/`flookup` installed and vendored submodule sources present

### Vendored FST Build Pipeline (`fst/build/build_fsts.py`)

1. Reads sources from pinned submodule `vendor/thamizhi-morph`
2. Extracts relevant upstream zip bundles (`foma/*.zip`) into `fst/build/.work/<component>/`
3. Applies local patches from `fst/patches/` in deterministic order
4. Compiles FST binaries with `foma` and writes canonical outputs to:
   - `build/fst-models/`
5. Syncs generated outputs to:
   - `static-word-list/fst-models/` (dictionary compatibility copy)
   - `server/fst-models/` (runtime validation copy)
6. Emits `fst/build/manifest.json` with submodule commit, patch SHA256 hashes, UTC build timestamp, output SHA256 checksums
6. Current noun patches:
   - `0001-fix-c11-acc.patch` (Class 11 noun accusative `^னை -> ^ை`)
   - `0002-fix-noun-class-duplicates.patch` (removes cross-class duplicate noun roots to prevent class leakage)
   - `0003-fix-noun-malformed-locatives.patch` (fixes C6 locative behavior, including `-ட்டு` subclass handling and malformed `^டிடம்` path)

### Server-Side FST Validation (`server/index.js`)

- **11 long-lived core `flookup` child processes** by default (noun/adj/adv/part/pronoun + verb classes), stdin/stdout pipes kept open
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

Core gameplay analytics tables with WAL mode enabled, plus auth/session tables via idempotent migrations (`schema_migrations`):

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `visits` | Page view tracking + geo | `page` ('landing'\|'game'), `game_id`, `user_id`, nullable `account_id`, `ip`, `user_agent`, `referrer`, `country_code`, `country`, `region`, `city`, `timezone`, `geo_source`, `geo_resolved_at`, `created_at` |
| `games` | One row per game session + type + country snapshot | `game_id`, `game_type` ('multiplayer'\|'singleplayer'), nullable `account_id`, `player1_id`, `player2_id` (`computer-player` for solo), scores, `winner_id`, `game_over_reason`, `total_turns`, `player1_country_code`, `player2_country_code`, `started_country_code`, `ended_country_code`, `started_at`, `ended_at` |
| `turns` | One row per turn action | `game_id`, `games_row_id` (FK), `user_id`, nullable `account_id`, `turn_type` ('word'\|'pass'\|'swap'), `score`, `words_played` (JSON), `tiles_placed`, `placed_tiles_json` (JSON), `formed_words_json` (JSON) |
| `players` | Persistent profile + rating + last seen geo | `user_id`, `username`, `rating`, `games_played`, `wins`, `losses`, `draws`, `total_score`, `last_country_code`, `last_country`, `last_region`, `last_city`, `last_seen_ip_hash`, `last_seen_at`, `created_at`, `updated_at` |
| `game_state_snapshots` | Per-user resumable multiplayer state snapshots | `game_id`, `games_row_id` (FK), `user_id`, nullable `account_id`, `state_json` (JSON), `updated_at` |
| `accounts` | Email/password auth accounts | `id`, unique `email`, `password_hash`, `email_verified_at`, `status`, timestamps |
| `account_profiles` | Account-owned profile (username + stats mirror) | `account_id` (PK/FK), `username`, rating/stats, timestamps, unique `lower(username)` |
| `account_sessions` | Refresh-token sessions | `id`, `account_id`, `refresh_token_hash`, `expires_at`, `revoked_at`, client hashes, timestamps |
| `email_verification_tokens` | Verification token storage | `id`, `account_id`, `token_hash`, `expires_at`, `used_at`, timestamps |
| `password_reset_tokens` | Reset token storage | `id`, `account_id`, `token_hash`, `expires_at`, `used_at`, timestamps |
| `account_player_links` | Guest-to-account link bridge | `account_id`, `player_user_id`, `linked_at`, unique pair + unique `player_user_id` |

### REST API Endpoints

All endpoints served on the same port as WebSocket (default 8000). CORS uses the same `ALLOWED_ORIGINS` config.

Admin analytics endpoints require:
- Server env var: `ANALYTICS_ADMIN_PASSWORD`
- Request header: `X-Admin-Password`

Without `ANALYTICS_ADMIN_PASSWORD`, admin analytics endpoints return `503`.

Cookie-auth CSRF requirement:
- `POST /api/auth/refresh` and `POST /api/auth/logout` use double-submit CSRF validation (`solmaalai_csrf` cookie must match `X-CSRF-Token` header) whenever a refresh cookie is present.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/signup` | Create account + profile and start session (`{email,password,username,userId?}`) |
| `POST` | `/api/auth/login` | Login with email/password; returns access token + sets refresh cookie |
| `POST` | `/api/auth/logout` | Revoke current refresh session and clear refresh + CSRF cookies (requires `X-CSRF-Token` when refresh cookie is present) |
| `POST` | `/api/auth/refresh` | Rotate refresh session, return new access token + refreshed refresh/CSRF cookies (requires `X-CSRF-Token` match) |
| `GET` | `/api/auth/me` | Return authenticated account/profile from bearer access token |
| `GET` | `/api/auth/email-health` | Admin-protected SMTP/fallback health check (`X-Admin-Password`) |
| `POST` | `/api/auth/verify-email` | Consume verification token and mark account email verified |
| `POST` | `/api/auth/resend-verification` | Authenticated resend for verification token/email |
| `POST` | `/api/auth/forgot-password` | Request password reset token/email (safe non-enumerating response) |
| `POST` | `/api/auth/reset-password` | Consume reset token and set new Argon2id password hash |
| `POST` | `/api/visit` | Record a page visit (`{page, gameId, userId}`) |
| `POST` | `/api/profile` | Update username (`Authorization` bearer updates `account_profiles`; guest fallback still uses `{userId, username}` when guest mode is enabled) |
| `GET` | `/api/leaderboard?limit=N` | Top players by rating (default 20, max 100) |
| `GET` | `/api/games?userId=...&limit=N` | Account-first games list (authenticated account scope first; guest fallback for legacy sessions) |
| `GET` | `/api/games/:gameId?userId=...` | Account-first game detail authorization with guest fallback for legacy rows |
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
| `newGame` | `startGame()` (account-aware when WS auth present) + `setPlayer2()` if opponent in room |
| Player joins (non-reconnection) | `setPlayer2()` if active game exists |
| `turn` | `recordTurn()` with type 'word', score, formed words, and placed tile positions for replay (account-aware when WS auth present) |
| `passTurn` | `recordTurn()` with type 'pass' (account-aware when WS auth present) |
| `swapTiles` | `recordTurn()` with type 'swap' (account-aware when WS auth present) |
| `gameOver` | `endGame()` with winner resolution and reason |
| `stateSnapshot` | `saveGameStateSnapshot()` upsert per `(games_row_id, user_id)` with account stamping when available |

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
{WS_BASE_URL}/{gameId}/{userId}?name={username}[&token=...]
```

`WS_BASE_URL` is derived at runtime. In localhost dev (ports `3000/5173/4173`), it targets `ws://{host}:8000`; otherwise it uses same-origin `ws(s)://{host}`.

The WebSocket connection is managed via React Context (`WebSocketContext.js`), providing:
- Auto-reconnect on recoverable disconnects (3-second delay)
- Connection state tracking (`isConnected`, `connectionError`)
- Exposed close metadata (`closeEvent`) for fatal join handling in `App.js`
- `sendTurn(turnInfo)` — broadcast turn to other players in room
- `sendMessage(message)` — generic fire-and-forget broadcast to room
- `sendRequest(message, timeoutMs)` — request-response with `requestId` matching, returns Promise
- `sendChat(text)` — send chat message (trimmed to 500 chars)
- `chatMessages` state — array of `{userId, username, text, timestamp}` objects

### Room Management (Server)
- Rooms are keyed by `gameId`, created on first connection
- Max 2 players per room (additional connections rejected)
- Empty rooms cleaned up after 5-minute delay
- `wsMetadata` WeakMap provides reverse lookup from WebSocket to `{gameId, userId, accountId}`
- `broadcastToRoom(gameId, senderId, message)` sends to all OTHER players
- `sendToAllInRoom(gameId, message)` sends to ALL players (used for chat)
- Fatal WebSocket close codes:
  - `4000`: malformed URL path
  - `4001`: room full (max 2 players)
  - `4002`: too many connections from IP
  - `4003`: origin not allowed
  - `4004`: invalid/expired auth token (or missing token when guest mode is disabled)
  - `4005`: disabled account

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

**Landing Page**: `createGame`, `playRandomOpponent`, `playVsComputer`, `joinGame`, `enterGameCode`, `join`, `howToPlay`, `myGames`, `continueGame`, `viewFinalBoard`, and other matchmaking/join helper labels are defined in `LanguageContext` and consumed by `App.js`.

**Single Player**: `computer`, `computerThinking`, `vsComputer`

**Help Modal**: `helpTitle` ("Game Rules" / "விளையாட்டு முறை"), `helpClose`, `helpSections` (array of 8 `{title, body}` objects covering: Goal, Tiles, Forming Words, Combining Letters, Bonus Tile, Scoring, Swapping Tiles, Passing)

**Confirmation Dialogs**: `confirmNewGame`, `confirmPass`, `yes`, `no`

**In-Game Navigation**: `home`, `backToLanding`

**Game Over**: `gameOverTie`, `gameOverWon`, `gameOverLost`, `gameOverPasses`, `gameOverTilesOut`, `gameOverNewGame`, `vs`

### Components Using Translations
- `App.js` — landing page: title, mode actions, join-private input, leaderboard, help modal, language toggle
- `App.js` — landing page: title, mode actions, join-private input, leaderboard, My Games list, help modal, language toggle
- `ScoreBoard.js` — role labels (`t.you`, `t.opponent`), turn badge (`t.turn`), usernames from Redux `playerNames`
- `ConnectionStatus.js` — status text, turn indicator
- `TurnHistory.js` — header, empty state, pass/swap labels (swap entries include swapped tile count)
- `LetterBags.js` — header, total label (tile type labels are Tamil-only: மெய், உயிர், மாயம்)
- `Chat.js` — header, empty state, input placeholder, send button
- `GameFrame.js` — top bar brand link/aria text + GameOverOverlay result/reason text, player labels
- `ActionMenu.js` — swap mode toast, HelpModal content, ConfirmDialog text

## User Flow

### Landing Page → Game Entry
1. User visits the app → sees landing page with "சொல்மாலை" title
2. User sets/edits username (persisted locally and synced to `/api/profile`)
3. **New Game With Invited Opponent**: Creates 6-char uppercase room `gameId` → enters multiplayer game → invite modal auto-opens
4. **Play Random Opponent**: Joins matchmaking queue; once matched, auto-enters assigned `gameId`
5. **Play vs Computer**: Enters single-player game (no WebSocket)
6. **Join Private Game**: Enter code or full invite URL (`?game=...`) → enters multiplayer game
7. **Invite link** (`?game=XYZ`): Bypasses landing page → enters multiplayer game directly
8. **My Games → Continue**: Re-enters an in-progress multiplayer game without remembering the code
9. **My Games → View Final Board**: Opens finished games in the normal board UI using a static/read-only game frame (no dedicated review viewer)
10. **Solo URL resume** (`?game=SOLO-...`): Opens single-player game directly and hydrates saved state
11. **Shared solo URL in different browser profile/session**: If user-scoped lookup fails (`404`), app returns to landing with an access message (no accidental new game with same solo code).

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
8. Single-player sessions are persisted to SQLite (start/turn/end + snapshots) and appear in Landing **My Games** for Continue/View Final Board.

### Multiplayer Flow
1. **Player 1** creates a game from landing page → enters game with new gameId
2. WebSocket connects to `/{gameId}/{userId}` → game auto-starts: tiles drawn, rack filled, `newGame` broadcast
3. **Player 2** opens invite link (`?game=ABC123`) → joins same room (landing page skipped)
4. Server sends `playerJoined` to Player 1, `joinedExistingGame` to Player 2
5. Player 1 re-sends `newGame` (with their drawn tiles) to sync the late joiner
6. Player 2 receives `newGame` → `syncNewGame` deducts Player 1's tiles from bags, sets `needsInitialDraw` → `useGameSync` auto-draws Player 2's tiles and broadcasts `drewTiles`
7. Both players now have full racks. Players alternate turns, broadcasting `turn` messages with word positions and scores
8. Game ends when:
   - Tile bag exhausted + player's rack empty → `gameOverReason = 'tilesOut'`
   - 4 consecutive passes/swaps (2 per player) → `gameOverReason = 'consecutivePasses'`
9. Winner determined by score; `gameOver` message syncs result
10. Game-over overlay can be closed to inspect the final board + turn history without refreshing
11. If a third user opens the same multiplayer link while 2 players are already in room, join is rejected (`4001`) and client routes back to landing with a room-full error.

### Multiplayer Resume + Final Board View
1. Multiplayer clients persist debounced snapshots via `useGameSnapshotSync` (`stateSnapshot` WebSocket message).
2. Server stores snapshots in SQLite per `(games_row_id, user_id)`.
3. On multiplayer entry, `App.js` loads `/api/games/:gameId?userId=...` and hydrates Redux via `hydrateGameSnapshot` when snapshot data is available.
4. Landing-page **My Games** list enables:
   - **Continue** in-progress games without manually re-entering code.
  - **View Final Board** for finished games in a static/read-only `GameFrame` (no sync hooks, no ActionMenu controls).

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
- [x] Landing-page My Games list: continue in-progress games + view final board for finished games
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
- [x] **Dictionary Validation (client-side)**: Generated large Tamil dictionary with binary search (<1ms lookup)
- [x] **Dictionary Build Pipeline**: Python scripts combining Tamil Lexicon + Wiktionary + ThamizhiMorph verbs + FST noun/adj/adv forms
- [x] **FST Form Generation**: Generates noun/adj/adv/part/pronoun-derived forms using local foma/flookup models
- [x] **Server-side FST Validation**: 11 core long-lived flookup processes by default
- [x] **Vendored FST Upstream Management**: pinned `vendor/thamizhi-morph` submodule + local patch/build/manifest/regression framework under `fst/`
- [x] **Validation UI**: Async submit with spinner during server check, dictionary-loading toast, disabled Play until ready, error toasts for invalid words
- [x] **Bilingual UI**: Tamil/English language toggle across all components including landing page
- [x] **Help modal**: bilingual game instructions (8 sections), available on landing page and in-game
- [x] **Confirmation dialogs**: Pass turn and new game (when game in progress) require confirmation
- [x] **Tamil-inspired design**: peacock blue, vermilion, gold, teal, jade color scheme
- [x] **Deployment config**: Railway Docker deployment workflow documented in `deploy/DEPLOY.md`
- [x] **Analytics**: SQLite tracking for visits/games/turns with password-protected admin APIs (`/api/admin/*`)
- [x] **Geo analytics**: coarse Geo-IP enrichment for visits/profiles/games, hashed player IP tracking, and country breakdown admin endpoints
- [x] **Analytics Inspector UI**: `?analytics=1` view with summary cards, country breakdowns, game/user inspection, and board replay slider
- [x] **Auth integration test suite** (`cd server && npm test`): covers auth lifecycle with CSRF enforcement, account-scoped `/api/games/:gameId` authorization, and WS close codes `4004`/`4005` plus room-full `4001`

- [x] **Single Player Mode**: Play vs Computer with client-side AI engine
  - Anchor-based word generation with dictionary prefix pruning (O(log N) per check against sorted dictionary)
  - Tamil MEY+UYIR tile merging for UYIRMEY combinations
  - Cross-word validation, score calculation with multipliers
  - 5s search budget + timeout-aware quick fallback search before swap/pass fallback
  - Server-assisted rescue validation: bounded unknown-word batches validated via HTTP FST and cached before retrying search
  - Adaptive swap strategy (2-4 tiles based on rack/bag state) with recent-signature avoidance to reduce repeated swap loops
  - UI adapts: "vs Computer" status, "Computer" name, no Chat/Invite, "Thinking..." indicator

### TODO
- [ ] Tile Bag Optimization: balance distribution for fun gameplay
- [ ] Rendering & Code Optimization
- [ ] **Prod Email Delivery Migration (ZeptoMail API)**
  Context:
  - Railway Free plan blocks outbound SMTP, so `zoho_smtp` mode can fail in production with connection timeouts even when credentials are valid.
  Scope:
  - Add `EMAIL_PROVIDER=zeptomail_api` mode in `server/index.js`.
  - Implement verification/reset transactional email delivery via ZeptoMail HTTPS API (port 443), not SMTP.
  - Keep `zoho_smtp` + dev fallback modes for local/testing compatibility.
  Suggested environment variables:
  - `EMAIL_PROVIDER=zeptomail_api`
  - `ZEPTOMAIL_API_BASE_URL` (region-specific API base URL)
  - `ZEPTOMAIL_API_KEY` (secret API token/key from ZeptoMail)
  - `ZEPTOMAIL_SENDER_ADDRESS` (or reuse `EMAIL_FROM`)
  - Optional: verify/reset template IDs when switching to template-driven sends
  Related follow-ups:
  - Extend `GET /api/auth/email-health` to validate ZeptoMail API config/connectivity.
  - Keep signup non-blocking (already implemented): email send should remain queued/asynchronous.
  Security requirements:
  - Never log ZeptoMail secrets/tokens.
  - Never log raw verification/reset tokens.
  - Keep masked email debug behavior.
  Acceptance criteria:
  - Verify/reset emails deliver in production with `EMAIL_PROVIDER=zeptomail_api`.
  - `/api/auth/email-health` reports healthy in ZeptoMail mode.
  - Auth flows (signup, verify, forgot/reset) continue to work without UI regressions.

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
1. Build/refresh local FST binaries from pinned upstream + patches: `npm run fst:build`
2. Regenerate FST surface forms: `python3 static-word-list/generate_fst_forms.py`
3. Build combined dictionary: `python3 static-word-list/build_dictionary.py`
4. Run regression checks (including dictionary include/exclude assertions): `python3 fst/tests/run_fst_regressions.py --check-dictionary`
5. Output: `public/tamil_dictionary.txt` (served to browser)

Shortcut:
- `npm run dict:build` executes the full sequence above (`fst:build` + form generation + dictionary build + regression check).

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
- `AUTH_ENABLED` — Enables account auth endpoints/session flow (`false` by default; requires token secrets)
- `GUEST_MODE_ENABLED` — Keeps legacy guest identity/profile flow active (`true` default; set `false` to require auth for profile updates)
- `AUTH_ACCESS_TOKEN_SECRET` — HMAC secret for short-lived access tokens
- `AUTH_REFRESH_TOKEN_SECRET` — HMAC secret for refresh token signing
- `AUTH_ACCESS_TTL_MINUTES` — Access token TTL (default `15`)
- `AUTH_REFRESH_TTL_DAYS` — Refresh token/session TTL (default `30`)
- `AUTH_COOKIE_NAME` — Refresh cookie name (default `solmaalai_rt`)
- `AUTH_CSRF_COOKIE_NAME` — CSRF cookie name for double-submit protection (default `solmaalai_csrf`)
- `AUTH_COOKIE_SECURE` — Set `true` in HTTPS production to mark refresh cookie Secure
- `AUTH_CLEANUP_INTERVAL_MINUTES` — Interval for deleting expired/revoked auth sessions and used/expired auth tokens (default `30`)
- `AUTH_EMAIL_VERIFICATION_TTL_HOURS` — Verification token TTL in hours (default `24`)
- `AUTH_PASSWORD_RESET_TTL_MINUTES` — Password reset token TTL in minutes (default `30`)
- `APP_BASE_URL` — App origin used for auth token audience metadata
- `EMAIL_PROVIDER` — Optional outbound email provider selector. `zoho_smtp` enables real SMTP delivery; empty enables safe dev fallback responses
- `EMAIL_FROM` — Optional from-address when email provider integration is enabled
- `EMAIL_SMTP_HOST` — SMTP host for provider (Zoho is region-specific; e.g. `smtppro.zoho.in`, `smtppro.zoho.com`, `smtp.zoho.com`)
- `EMAIL_SMTP_PORT` — SMTP port (Zoho SSL default `465`)
- `EMAIL_SMTP_SECURE` — SMTP secure flag (`true` for Zoho 465)
- `EMAIL_SMTP_USER` — SMTP auth username (typically full sender email)
- `EMAIL_SMTP_PASS` — SMTP auth password/app-password
- `EMAIL_SMTP_CONNECTION_TIMEOUT_MS` — SMTP connect timeout in ms (default `10000`)
- `EMAIL_SMTP_GREETING_TIMEOUT_MS` — SMTP greeting timeout in ms (default `10000`)
- `EMAIL_SMTP_SOCKET_TIMEOUT_MS` — SMTP socket timeout in ms (default `15000`)
- `EMAIL_DEBUG` — Optional safe SMTP debug logging (masks emails, never logs passwords/tokens)
- `GEO_PROVIDER` — Geo lookup provider: `none` (default), `ipwhois`, or `ipapi`
- `GEO_LOOKUP_TIMEOUT_MS` — Geo lookup timeout in milliseconds (default `800`)
- `GEO_CACHE_TTL_MS` — In-memory geo cache TTL in milliseconds (default `86400000`)
- `GEO_IP_HASH_SALT` — Salt used for SHA-256 IP hashing stored in `players.last_seen_ip_hash`

### Server (`server/index.js`)
The server at `server/index.js` is an HTTP + WebSocket server on a single port:
1. **HTTP server** wraps the WebSocket server — serves gameplay REST APIs and protected analytics admin APIs
2. Accepts WebSocket connections at `/{gameId}/{userId}?name={username}` path (optionally with `token` query fallback). Client sends access token via WebSocket subprotocol (`bearer`, `<token>`) when authenticated.
3. Validates origin against `ALLOWED_ORIGINS` (permissive in dev when unset)
4. Enforces per-IP connection limits (max 10)
5. Manages rooms (Map of gameId → players Map, max 2 per room)
6. Broadcasts game messages to other players in the same room
7. Rate-limits messages (30/sec sliding window) and rejects oversized messages (>100KB)
8. Validates input per message type (chat text ≤ 500, validateWords ≤ 20, etc.)
9. Handles `validateWords` requests via FST process pool (unicast response)
10. Manages long-lived core `flookup` child processes with respawn on crash
11. Maintains random-opponent matchmaking queue (`/api/matchmaking/join|status|cancel`)
12. Stores persistent player profiles + leaderboard data (`players` table, `/api/profile`, `/api/leaderboard`)
13. **Hooks analytics** into game message handlers (newGame, turn, pass, swap, gameOver), including tile placement capture for board replay
14. Periodically cleans expired/revoked auth sessions and consumed/expired verification/reset tokens (`AUTH_CLEANUP_INTERVAL_MINUTES`, default 30)
15. Cleans up empty rooms after 5 minutes
16. Gracefully shuts down flookup processes, analytics DB, and HTTP server on SIGINT
17. Start with: `npm run fst:build && cd server && npm start` (or `cd server && npm run setup && npm start` via compatibility wrapper)
18. Serves React static assets with HTTP cache headers and conditional request handling (`ETag` + `Last-Modified`): hashed build assets are immutable for 1 year, `tamil_dictionary.txt` is cached for 24h, and fresh conditional requests return `304 Not Modified`

### FST Models
- **Canonical output** (`build/fst-models/`): Generated by `npm run fst:build`
- **Build-time consumer copy** (`static-word-list/fst-models/`): Used by dictionary tooling compatibility paths
- **Runtime** (`server/fst-models/`): Used by server's flookup processes for real-time validation
- Build command: `npm run fst:build` (also invoked by `cd server && npm run setup`)
- Source of truth: pinned submodule `vendor/thamizhi-morph` + local patches under `fst/patches/`
- Regression command: `npm run fst:test`
- Canonical architecture doc: `Docs/FST_ARCHITECTURE.md`

### Dictionary Binary Search
The dictionary is sorted with Python's `sorted()` (Unicode codepoint order). The JavaScript binary search MUST use `<`/`>` operators, NOT `localeCompare()`. Locale-aware Tamil sorting differs from codepoint order and will cause lookup failures.

### User ID Persistence
User IDs are stored in cookies (`solladukku` cookie, 1-year TTL) for session persistence.

### Username Persistence
Usernames are stored in `localStorage` (`solladukku_username`) and synced to server with `POST /api/profile`.

### Deployment (Railway)
Deployed as a single Dockerfile-based service on Railway:
- `Dockerfile` builds the React frontend, then sets up the Node.js server
- `Dockerfile` builds patched FST models during image build via `npm run fst:build` (using `vendor/thamizhi-morph` + `fst/patches`) before producing the frontend/server runtime image
- Server serves the static React build for non-API routes + handles WebSocket/API on the same port
- Static file caching is handled in `server/index.js` (not nginx): `ETag`/`Last-Modified` are emitted and respected so unchanged assets (including `tamil_dictionary.txt`) are revalidated and not re-downloaded on refresh
- Auto-deploys on push to `main` (connected via GitHub integration)
- `railway.toml` `watchPatterns` limits rebuilds to code changes (skips doc-only commits)
- Custom domain: `solmaalai.com` (CNAME → Railway). `சொல்மாலை.com` redirects via Namecheap.
- `Dockerfile` installs `foma`/`flookup` and `git`; FST patch application/compilation runs in-container so production always uses patched runtime models generated at build time
- `Dockerfile` also installs native build prerequisites (`python3`, `make`, `g++`) so `argon2` can compile if prebuilt binaries are unavailable
- Dictionary file (135MB) stored via Git LFS. Railway's Docker builder doesn't resolve LFS pointers, so the Dockerfile detects this (file < 1KB) and downloads the actual file from GitHub.
- Railway CLI: `railway up` for manual deploy, `railway logs` to check output

### Debugging
Console logs are present throughout for debugging. Key areas:
- `App.js`: Game creation and joining
- `ActionMenu.js`: Turn submission, validation flow, server fallback
- `WebSocketContext.js`: Message send/receive, request-response matching
- `dictionary.js`: Dictionary load, cache hits/misses
- `server/index.js`: FST validation requests and results, room management, rate limiting
- Redux slices: State updates
