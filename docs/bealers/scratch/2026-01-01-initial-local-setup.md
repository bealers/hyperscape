# Initial Local Setup

**Date:** 2026-01-01  
**Status:** Complete

## Summary

Following the README to get Hyperscape running locally. Two project-level issues encountered, both with straightforward workarounds.

## Issue 1: TypeDoc Plugin Blocks Standard Build

The standard `bun run build` command fails due to a TypeDoc plugin compatibility issue:

```
[error] The plugin typedoc-plugin-markdown could not be loaded
[error] SyntaxError: Export named 'Converter' not found in module
```

**Workaround:** Build packages individually, ensuring PhysX is built first:

```bash
cd packages/physx-js-webidl && bun run build
bun run build:shared
bun run build:server
bun run build:client
```

## Issue 2: Fresh Database Requires Schema Push

On first run, the server starts but logs database errors because the schema doesn't exist yet:

```
error: relation "config" does not exist
```

The server continues to run despite these errors, but functionality will be limited.

**Fix:** Push the schema after the server creates the PostgreSQL container:

```bash
cd packages/server
bunx drizzle-kit push --force
```

## Running Services

| Service | URL |
|---------|-----|
| Client | http://localhost:3333 |
| Server | http://localhost:5555 |
| CDN | http://localhost:8080 |
| PostgreSQL | localhost:5432 |

## Performance

Running on M4 MacBook Air (16GB RAM) - getting ~20fps in dev mode. Likely causes:
- Dev mode overhead (Vite HMR, source maps)
- PhysX WASM running in browser
- VRM avatar rendering

Production build would likely perform better.

## Persistence Model

Characters are stored in PostgreSQL (Docker container). Important to understand:
- **Dev mode = local only** - data lives in the Docker container on this machine
- **Each deployment is isolated** - deploying a fork with a hosted DB creates a separate data island
- **No public server yet** - there's no canonical "live" instance everyone shares

To preserve dev work across deployments, either:
1. Point dev `.env` at a hosted DB (e.g., Neon free tier)
2. Manually export/import data between databases

## Notes

- The README mentions `bun run build` but doesn't flag the TypeDoc issue
- Database schema push isn't mentioned in the quick start guide - might be worth adding
- Dev mode performance is noticeably sluggish even on recent hardware

