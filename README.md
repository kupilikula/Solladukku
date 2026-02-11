# Solmaalai (சொல்மாலை)

A multiplayer Tamil Scrabble game built with React and WebSockets.

## Features

- Real-time two-player multiplayer via WebSocket rooms
- Tamil/English bilingual UI
- 2.85M-word Tamil dictionary with server-side FST validation fallback
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

Open http://localhost:3000. Create a game, then share the invite link to play with a friend.

## Tech Stack

- **Frontend**: React, Redux Toolkit
- **Backend**: Node.js WebSocket server
- **Validation**: Two-tier system — client-side binary search + server-side FST fallback
- **Analytics**: SQLite via better-sqlite3
