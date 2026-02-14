# Authentication & Account Roadmap (Implementation Handoff)

Date: February 14, 2026  
Repo: `solmaalai`  
Status: Planning document for execution in a new Codex session

## 1. Purpose

This roadmap defines a full, incremental migration from browser-cookie identity (`solladukku` UUID) to real authenticated accounts, without breaking existing gameplay.

Primary outcomes:

1. Cross-device ownership and resume.
2. True unique usernames (non-hijackable).
3. Cleaner access control for game links.
4. Strong foundation for ranked/social features.

## 2. Current State Summary (as of Feb 14, 2026)

### Identity today

1. User identity is browser cookie-based (`solladukku`) in `src/App.js`.
2. Username is localStorage-backed (`solladukku_username`) and synced by `POST /api/profile`.
3. No authentication boundary: identity is effectively possession of local cookie + username choice.

### Existing game persistence

1. Multiplayer snapshots are persisted via WebSocket `stateSnapshot` and stored in SQLite.
2. Solo games persist via REST:
   1. `POST /api/solo/start`
   2. `POST /api/solo/turn`
   3. `POST /api/solo/end`
   4. `POST /api/solo/snapshot`
3. My Games list is currently user-scoped by `userId`:
   1. `GET /api/games?userId=...`
   2. `GET /api/games/:gameId?userId=...`

### Existing protections already implemented

1. Unique username index exists for `players(lower(username))`.
2. Solo shared link access:
   1. Unauthorized/foreign profile currently falls back to landing with a clear error.
3. Multiplayer third-join handling:
   1. WS close code `4001` (room full), client exits to landing with localized message.
4. Fatal WS close code handling exists for:
   1. `4000` malformed URL
   2. `4001` room full
   3. `4002` too many IP connections
   4. `4003` origin not allowed

## 3. Auth Scope for Phase-1 Launch

Implement in this order:

1. Email/password accounts with session auth.
2. Account-owned unique usernames.
3. Account-scoped My Games and game detail access.
4. WS auth token verification.
5. Guest compatibility path (temporary).

Not in phase-1:

1. OAuth providers.
2. Friends graph.
3. Full moderation tooling.
4. Public game review sharing.

## 4. Target Architecture

### Auth model

1. Account record with verified email + password hash.
2. Session table with refresh token hashes.
3. Short-lived access token for API + WebSocket authentication.
4. HttpOnly refresh cookie; access token returned in JSON and stored in memory on client.

### Ownership model

1. `account_id` becomes primary owner identity for protected data.
2. Existing `players.user_id` remains for migration/compatibility.
3. `account_player_links` maps pre-auth guest identity to a real account.

## 5. Database Plan (SQLite)

Add these tables via migrations:

1. `accounts`
   1. `id TEXT PRIMARY KEY`
   2. `email TEXT NOT NULL UNIQUE`
   3. `password_hash TEXT NOT NULL`
   4. `email_verified_at TEXT`
   5. `status TEXT NOT NULL DEFAULT 'active'`
   6. `created_at TEXT DEFAULT datetime('now')`
   7. `updated_at TEXT DEFAULT datetime('now')`
2. `account_profiles`
   1. `account_id TEXT PRIMARY KEY REFERENCES accounts(id)`
   2. `username TEXT NOT NULL`
   3. rating/stats fields mirroring current `players` (`rating`, `games_played`, etc.)
   4. timestamps
   5. `UNIQUE INDEX lower(username)`
3. `account_sessions`
   1. `id TEXT PRIMARY KEY`
   2. `account_id TEXT NOT NULL REFERENCES accounts(id)`
   3. `refresh_token_hash TEXT NOT NULL`
   4. `expires_at TEXT NOT NULL`
   5. `revoked_at TEXT`
   6. `ip_hash TEXT`
   7. `user_agent_hash TEXT`
   8. timestamps
4. `email_verification_tokens`
   1. `id TEXT PRIMARY KEY`
   2. `account_id TEXT NOT NULL REFERENCES accounts(id)`
   3. `token_hash TEXT NOT NULL`
   4. `expires_at TEXT NOT NULL`
   5. `used_at TEXT`
   6. timestamps
5. `password_reset_tokens` (same pattern as verification tokens)
6. `account_player_links`
   1. `account_id TEXT NOT NULL REFERENCES accounts(id)`
   2. `player_user_id TEXT NOT NULL`
   3. `linked_at TEXT DEFAULT datetime('now')`
   4. `UNIQUE(account_id, player_user_id)`
   5. `UNIQUE(player_user_id)` to prevent ambiguous ownership

Add nullable `account_id` columns to:

1. `games`
2. `turns`
3. `game_state_snapshots`
4. `visits` (optional, but useful for analytics correlation)

Migration notes:

1. Use idempotent `CREATE TABLE IF NOT EXISTS` + guarded `ALTER TABLE` style, consistent with current `analytics.js`.
2. Add `schema_migrations` table and explicit migration runner.
3. Do not drop existing `players`/guest columns in phase-1.

## 6. Backend API Additions

Implement in `server/index.js` plus new auth helper module(s) (recommended: `server/auth.js`).

### Public auth endpoints

1. `POST /api/auth/signup`
2. `POST /api/auth/login`
3. `POST /api/auth/logout`
4. `POST /api/auth/refresh`
5. `GET /api/auth/me`
6. `POST /api/auth/verify-email` (token consume)
7. `POST /api/auth/resend-verification`
8. `POST /api/auth/forgot-password`
9. `POST /api/auth/reset-password`

### Existing endpoint updates

1. `POST /api/profile`
   1. For authenticated users: update `account_profiles`.
   2. For guests: keep current behavior as compatibility fallback.
2. `GET /api/games`
   1. Prefer account-scoped lookup when authenticated.
   2. Guest fallback remains.
3. `GET /api/games/:gameId`
   1. Authorize by account participation first.
   2. Guest fallback for legacy sessions.
4. Solo persistence endpoints should stamp `account_id` when authenticated.

### Error semantics (standardize)

1. `401` unauthenticated.
2. `403` authenticated but forbidden.
3. `404` resource not found (only when safe to reveal).
4. `409` uniqueness conflicts (email/username).

## 7. WebSocket Auth Plan

### Client

1. Pass access token on WS connect.
2. Preferred: `Sec-WebSocket-Protocol` with `bearer,<token>` or query `?token=...` if protocol route is too invasive.
3. Keep current reconnect strategy:
   1. Reconnect for transient network closures.
   2. Do not reconnect for fatal server auth/validation codes.

### Server

1. Validate token before room admission.
2. Add close codes:
   1. `4004` invalid/expired auth token
   2. `4005` disabled account
3. Preserve existing close code behavior (`4000`..`4003`).
4. Store `accountId` in ws metadata.

## 8. Frontend Changes

### New state and UI

1. Add auth state bootstrap in `src/App.js`.
2. Add login/signup UI component(s):
   1. Option A: inline modal
   2. Option B: dedicated auth screen
3. Show guest/auth identity in landing header.
4. Add logout action.

### My Games behavior

1. Authenticated user: account-scoped list across devices.
2. Guest: current local/browser-scoped behavior.

### Link handling behavior

1. For protected game link with no auth:
   1. Prompt login.
   2. Retry once after login.
2. If still unauthorized:
   1. Clear `?game`.
   2. Return landing with localized error.

### i18n

Add full EN+TA keys for:

1. signup/login/logout flows
2. invalid credentials
3. verification required
4. password reset states
5. session expired
6. unauthorized game access

## 9. Security Requirements

1. Hash passwords with Argon2id.
2. Never store raw refresh tokens; store hash only.
3. Refresh cookie:
   1. `HttpOnly`
   2. `Secure` in production
   3. `SameSite=Lax` (or `Strict` if UX allows)
4. CSRF guard for cookie-authenticated endpoints.
5. Per-endpoint rate limits for auth routes.
6. Login brute-force protection by IP + email key.
7. Normalize emails to lowercase and trim.
8. Normalize usernames with existing sanitization rules.

## 10. Environment Variables

Add to `server/.env.example` and deployment secrets:

1. `AUTH_ACCESS_TOKEN_SECRET`
2. `AUTH_REFRESH_TOKEN_SECRET`
3. `AUTH_ACCESS_TTL_MINUTES=15`
4. `AUTH_REFRESH_TTL_DAYS=30`
5. `AUTH_COOKIE_NAME=solmaalai_rt`
6. `AUTH_COOKIE_SECURE=true|false`
7. `APP_BASE_URL`
8. `EMAIL_PROVIDER`
9. `EMAIL_FROM`
10. provider credentials (if verification/reset emails enabled now)

## 11. Incremental Delivery Phases

### Phase A: Data + primitives

1. Add migrations + auth helper module.
2. Add signup/login/logout/me endpoints.
3. Add session storage and token rotation.

Acceptance:

1. Can create account and login.
2. Session survives refresh.
3. Logout revokes refresh token.

### Phase B: Frontend auth UX

1. Add login/signup forms.
2. Add auth bootstrap (`/api/auth/me` + refresh path).
3. Add logout and UI state.

Acceptance:

1. Auth state correctly reflects page refresh/navigation.

### Phase C: Account-scoped game access

1. Add `account_id` writes on new games/snapshots.
2. Update `/api/games*` to prefer account authorization.
3. Link current guest id to account on first login (optional migration step).

Acceptance:

1. User can open same account on second browser and view/continue games.

### Phase D: WebSocket auth

1. Add token verification on connect.
2. Add fatal auth close code handling in client.
3. Ensure multiplayer still works for guests if guest mode remains enabled.

Acceptance:

1. Unauthorized WS connects are rejected cleanly.

### Phase E: Email verification + reset

1. Add token generation/storage.
2. Add verify/reset routes and UI screens.

Acceptance:

1. Verified flows succeed; expired tokens fail safely.

### Phase F: Hardening + cleanup

1. Expand tests.
2. Add session management and cleanup jobs.
3. Prepare optional deprecation of guest-only mode.

## 12. Test Plan

### Backend tests

1. Signup/login/logout/refresh lifecycle.
2. Duplicate email and duplicate username conflict.
3. Unauthorized access to game detail returns expected status.
4. Account owner can fetch own game detail.
5. Refresh token rotation and revoke.

### WebSocket tests

1. Valid token joins room.
2. Invalid token gets `4004`.
3. Third player still gets `4001` room full.

### Frontend/E2E tests

1. Login persists across refresh.
2. Cross-browser account resume for solo game.
3. Unauthorized link prompts login then rejects/accepts correctly.
4. Existing guest flows still work.

## 13. Rollout & Safety

1. Ship behind feature flag: `AUTH_ENABLED=true`.
2. Keep guest mode enabled initially (`GUEST_MODE_ENABLED=true`).
3. Monitor:
   1. auth endpoint error rates
   2. WS close code distribution
   3. game resume failure counts
4. Backout plan:
   1. disable `AUTH_ENABLED`
   2. continue guest identity flows unchanged

## 14. File-Level Implementation Checklist

Server:

1. `server/index.js`
2. `server/analytics.js`
3. `server/auth.js` (new)
4. `server/migrations/*.sql` or JS migration scripts
5. `server/.env.example`

Frontend:

1. `src/App.js`
2. `src/context/WebSocketContext.js`
3. `src/context/LanguageContext.js`
4. `src/components/Auth*.js` (new)
5. optional `src/utils/authClient.js` (new)

Docs:

1. `AGENTS.md` update as each phase lands
2. Optionally add `Docs/AuthRunbook.md` after implementation

## 15. Suggested Starter Prompt for New Codex Session

Use this prompt in the next session:

1. "Implement Phase A and Phase B from `Docs/AuthRoadmap-Feb14-2026.md`."
2. "Create idempotent migrations, add backend auth endpoints, and add frontend login/signup/logout + auth bootstrap."
3. "Preserve existing guest mode and do not break current multiplayer/solo resume behavior."
4. "Update AGENTS.md with all new API/schema/flow changes."
5. "Run build/tests and commit logically separated changes."

## 16. Open Decisions (Resolve Before/During Implementation)

1. Keep guest mode permanently or sunset later?
2. Require email verification before gameplay, or only before ranked features?
3. Access token transport for WS: query param vs subprotocol?
4. Do we expose public profiles immediately?
5. Do we migrate existing leaderboard to account-only, or hybrid display for transition?

---

This roadmap is intentionally detailed so implementation can be resumed in a fresh context window with minimal rediscovery.
