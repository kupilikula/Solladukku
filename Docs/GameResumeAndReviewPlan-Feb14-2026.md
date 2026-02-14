# Game Resume + Review Plan (Feb 14, 2026)

## Goals

1. Let players close the game-over result modal and inspect the final board/history.
2. Provide a "My Games" list (in-progress + finished) from the landing page.
3. Allow players to continue in-progress games after refresh.
4. Allow players to review finished games with board replay/final board view.
5. Persist enough game state to survive browser refresh and server restarts.

## Constraints and Current Gaps

- Existing analytics tables (`games`, `turns`) are enough to replay finished games, but not enough to reliably restore in-progress state (especially rack + exact bag state for a specific user).
- Current app only re-enters game automatically when URL has `?game=...`.
- No user-facing API for listing a player’s own games.

## Implementation Phases

### Phase 1: User-visible features

1. **Closeable game-over modal**
- Add dismiss action in `GameFrame` overlay.
- Keep board and turn history visible after closing.
- Maintain game-over protections (no new moves unless New Game).

2. **My Games APIs (non-admin)**
- `GET /api/games?userId=...&limit=...`
- `GET /api/games/:gameId?userId=...`
- Response includes in-progress/finished state and user authorization.

3. **Landing page My Games panel**
- Show recent games with status and opponent.
- Provide `Continue` for in-progress entries.
- Provide `Review` for finished entries.

4. **Finished game review screen**
- Read-only board replay and final-board view.
- Jump-to-turn controls using turn coordinates.

### Phase 2: Robust persistence for in-progress resume

1. **Snapshot persistence**
- New SQLite table for per-user game snapshots tied to game session row.
- Save snapshots from active clients with rack/board/bag/turn metadata.

2. **WebSocket snapshot message**
- Add `stateSnapshot` message type (client -> server) for persistence.
- Validate payload shape/size and upsert snapshot for `(games_row_id, user_id)`.

3. **Client auto-snapshot hook**
- Observe stable multiplayer state and send debounced snapshots.
- Snapshot excludes transient UI-only state (e.g., tile activation).

4. **Resume hydration**
- On multiplayer entry, fetch game detail for current user.
- Hydrate Redux from user snapshot when available.
- Fallback gracefully when snapshot is absent.

## Data Model Additions

- `game_state_snapshots`
  - `game_id TEXT`
  - `games_row_id INTEGER` (FK -> `games.id`)
  - `user_id TEXT`
  - `state_json TEXT`
  - timestamps
  - unique key: `(games_row_id, user_id)`

## Risks / Mitigations

1. **Snapshot drift between players**
- Persist per-user snapshots rather than a single global snapshot.
- Use latest snapshot only for requesting user’s resume.

2. **Large payloads**
- Debounce client snapshot sends.
- Send normalized state only (no unnecessary transient fields).

3. **Old games without snapshots**
- Continue support via game code and existing behavior.
- Review mode still works using recorded turns.

## Verification Plan

1. Start multiplayer game -> play several turns -> refresh -> continue via My Games and verify board/rack/turn.
2. End game -> close result modal -> inspect final board.
3. From landing My Games -> open finished game review and jump through turns.
4. Restart server during in-progress game -> resume via snapshot (if snapshot was saved before restart).
