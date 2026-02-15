# Solmaalai (சொல்மாலை)

A multiplayer Tamil Scrabble game built with React and WebSockets.

## Features

- Real-time two-player multiplayer via WebSocket rooms
- Private game rooms (create + invite by link/code)
- Random opponent matchmaking queue
- Single-player mode with AI opponent
- Persistent usernames
- Persistent leaderboard/rating system (SQLite-backed; shown when data exists)
- Password-protected admin analytics inspector (`?analytics=1`)
- Tamil/English bilingual UI
- Large Tamil dictionary (`public/tamil_dictionary.txt`) with server-side FST validation fallback
- Dictionary preloaded at app startup; Play button stays disabled until dictionary is ready
- HTTP fallback FST validation for single-player (`POST /api/validate-words`)
- Drag-and-drop tile placement
- In-game chat
- Invite friends with a shareable link

## Getting Started

### Prerequisites

- Node.js 18+
- `foma` + `flookup` (required only when rebuilding patched FST models and dictionary artifacts): `brew install foma`

### Running Locally

**Start the WebSocket server:**

```bash
npm install
npm run fst:build   # builds patched FST artifacts (canonical build/fst-models + synced copies)
cd server && npm install && npm start
```

**Start the React app (in a separate terminal):**

```bash
npm install
npm start
```

Open http://localhost:3000.

## FST and Dictionary Workflow

- Canonical FST architecture doc: `Docs/FST_ARCHITECTURE.md`
- FST patch/build/test workflow: `fst/README.md`
- One-command refresh (patched FSTs + dictionary + checks): `npm run dict:build`
- Full docs index: `Docs/README.md`

Landing page modes:
- `New Game With Invited Opponent` (creates a private room and auto-opens invite modal)
- `Play Random Opponent` (queue-based matchmaking)
- `Play vs Computer`
- `Join Private Game` (accepts either game code or full invite link)

Invite modal supports sharing:
- game code
- full invite link
- native Web Share API (when available)

## Healthcheck

The server exposes:

- `GET /health` → returns `200` JSON (`{ ok: true, service, timestamp }`)

For Railway deployments, set the service **Healthcheck Path** to `/health` to reduce deploy-time 500s during rollouts.

## Admin Analytics

1. Set `ANALYTICS_ADMIN_PASSWORD` in server environment variables.
2. Open the app with `?analytics=1` (example: `http://localhost:3000/?analytics=1`).
3. Enter the admin password in the inspector UI.

Protected endpoints are served under `/api/admin/*` and require `X-Admin-Password`.

## Tech Stack

- **Frontend**: React, Redux Toolkit
- **Backend**: Node.js WebSocket server
- **Validation**: Two-tier system — client-side binary search + server-side FST fallback
- **Validation transport**: WebSocket in multiplayer + HTTP fallback in single-player
- **Analytics**: SQLite via better-sqlite3
