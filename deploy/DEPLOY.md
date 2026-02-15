# Solmaalai Deployment Guide (Railway)

Canonical FST/source architecture: `Docs/FST_ARCHITECTURE.md`

## Deployment Model

- Single Railway service using the project `Dockerfile`
- Server and static frontend served from the same container (`node server/index.js`)
- WebSocket and HTTP API share the same origin/port

## Prerequisites

- Railway project connected to this repository
- Environment variables configured in Railway (at minimum `ALLOWED_ORIGINS`, auth/email/admin secrets as needed)

## Build Behavior

During Docker build, the image:

1. Installs dependencies (`foma`, `git`, `python3`, toolchain)
2. Copies `vendor/thamizhi-morph` + `fst/patches`
3. Runs `npm run fst:build` (applies patches, compiles FSTs, syncs outputs)
4. Builds React frontend (`npm run build`)
5. Installs production server dependencies

This guarantees production uses patched FST models built from the vendored upstream + local patches.

## First Deploy

1. Push branch to `main` (or trigger Railway deploy for your selected branch)
2. Wait for image build and deploy completion
3. Verify:
   - `GET /health` returns `200`
   - App loads and WebSocket connects
   - Word validation works

## Updates

For every code/patch change:

```bash
git pull
npm install
npm run fst:build
npm run fst:test
npm run dict:build   # when dictionary-affecting changes are present
```

Then push to trigger Railway deploy.

## Operational Checks

- `railway logs` for runtime errors
- `GET /health` for readiness/liveness
- Confirm `public/tamil_dictionary.txt` is the intended build output before deploy when dictionary changes are included

