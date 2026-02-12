# Solmaalai (சொல்மாலை)

A multiplayer Tamil Scrabble game built with React and WebSockets.

## Features

- Real-time two-player multiplayer via WebSocket rooms
- Private game rooms (create + invite by link/code)
- Random opponent matchmaking queue
- Single-player mode with AI opponent
- Persistent usernames
- Persistent leaderboard/rating system (SQLite-backed; shown when data exists)
- Tamil/English bilingual UI
- 2.85M-word Tamil dictionary with server-side FST validation fallback
- HTTP fallback FST validation for single-player (`POST /api/validate-words`)
- Drag-and-drop tile placement
- In-game chat
- Invite friends with a shareable link

## Getting Started

### Prerequisites

- Node.js 18+
- `foma` (optional, for rebuilding dictionary FST models): `brew install foma`

### Running Locally

**Start the WebSocket server:**

```bash
cd server
npm install
npm run setup    # Downloads FST models for word validation
npm start
```

**Start the React app (in a separate terminal):**

```bash
npm install
npm start
```

Open http://localhost:3000.

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

## Tech Stack

- **Frontend**: React, Redux Toolkit
- **Backend**: Node.js WebSocket server
- **Validation**: Two-tier system — client-side binary search + server-side FST fallback
- **Validation transport**: WebSocket in multiplayer + HTTP fallback in single-player
- **Analytics**: SQLite via better-sqlite3
