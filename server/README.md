# Solmaalai Server

Node.js server that handles:

- HTTP REST API
- WebSocket multiplayer rooms
- Server-side FST word validation
- SQLite analytics

Runs on a single port (default `8000`).

## Running

```bash
npm install
npm run setup   # downloads FST models
npm start
```

## WebSocket

Connection path:

```text
/{gameId}/{userId}?name={username}
```

Room behavior:

- Room key = `gameId`
- Max 2 players per room
- Broadcast turn/newGame/swap/pass/gameOver/chat events
- Profile sync events: `setProfile` / `playerProfile`
- Request-response validation: `validateWords` -> `validateWordsResult`

## HTTP Endpoints

- `GET /health` - readiness/liveness endpoint
- `POST /api/visit` - analytics page visit
- `POST /api/profile` - upsert player profile (`{ userId, username }`)
- `GET /api/stats` - aggregate analytics stats
- `GET /api/leaderboard?limit=N` - leaderboard ranked by rating
- `GET /api/games?limit=N` - recent games
- `GET /api/games/:gameId` - game detail + turns
- `GET /api/visits/daily?days=N` - daily visit counts
- `POST /api/validate-words` - FST validation via HTTP (`{ words: string[] }`, max 20)
- `POST /api/matchmaking/join` - enter random matchmaking queue
- `GET /api/matchmaking/status?userId=...` - matchmaking status
- `POST /api/matchmaking/cancel` - leave matchmaking queue

## Notes

- FST validation is permissive when `flookup`/models are unavailable.
- Set `STRICT_SERVER_VALIDATION=true` to reject unknown words when server-side validation is unavailable.
- Set `ENABLE_GUESS_FSTS=true` to include permissive `*-guess.fst` models (default is disabled for stricter validation).
- Configure `ALLOWED_ORIGINS` in production for CORS and WebSocket origin checks.
- For Railway, configure healthcheck path to `/health`.
- Matchmaking assigns a private `gameId` once two queued users are available.
