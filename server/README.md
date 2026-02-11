# Solmaalai WebSocket Server

Simple WebSocket server for testing multiplayer functionality.

## Running

```bash
npm install
npm start
```

Server runs on `ws://localhost:8000`.

## Features

- Accepts connections at `/{userId}` path
- Tracks connected players in a single default room
- Broadcasts turn messages to other players
- Notifies players when others join/leave

## Message Types

### Incoming (from client)

**Turn**
```json
{
  "messageType": "turn",
  "turnInfo": { ... }
}
```

**Chat**
```json
{
  "messageType": "chat",
  "text": "Hello!"
}
```

### Outgoing (to clients)

**Player Joined**
```json
{
  "messageType": "playerJoined",
  "playerIds": ["uuid-1", "uuid-2"]
}
```

**Player Left**
```json
{
  "messageType": "playerLeft",
  "userId": "uuid-1"
}
```

**Turn** (broadcast from another player)
```json
{
  "messageType": "turn",
  "turnInfo": { ... }
}
```

## Notes

This is a development server. For production, consider:
- Room management (multiple games)
- Authentication
- Game state persistence
- Rate limiting
