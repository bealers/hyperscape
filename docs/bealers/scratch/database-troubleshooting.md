# Database Troubleshooting Guide

This guide covers common database issues when setting up Hyperscape for local development.

## Prerequisites

Before troubleshooting, ensure you have:
- Docker installed and running
- Completed all steps in the main README
- Run `bun install` and `bun run build`

## Verifying Database Setup

### 1. Check PostgreSQL Container is Running

```bash
docker ps | grep postgres
```

You should see a container named `hyperscape-postgres` running. If not:

```bash
# The server will auto-start PostgreSQL when USE_LOCAL_POSTGRES=true
cd packages/server && bun run dev
```

### 2. Verify Database Connection

```bash
docker exec hyperscape-postgres psql -U hyperscape -d hyperscape -c "SELECT 1"
```

Expected output:
```
 ?column? 
----------
        1
(1 row)
```

### 3. Check Tables Exist

```bash
docker exec hyperscape-postgres psql -U hyperscape -d hyperscape -c "\dt"
```

You should see 18 tables including `users`, `characters`, `inventory`, etc.

## Common Issues

### Issue: "relation X does not exist"

**Symptoms:**
- Server starts but shows errors like `relation "users" does not exist`
- Infinite loading screen in browser
- Errors querying `player_sessions`, `config`, or other tables

**Cause:** Database migrations haven't been applied to a fresh database.

**Solution:**

1. Check if tables exist:
   ```bash
   docker exec hyperscape-postgres psql -U hyperscape -d hyperscape -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
   ```

2. If no tables exist, push the schema:
   ```bash
   cd packages/server
   bunx drizzle-kit push
   ```
   
   When prompted, select "Yes, I want to execute all statements".

3. Restart the server:
   ```bash
   bun run dev
   ```

### Issue: Port 5555 Already in Use (EADDRINUSE)

**Symptoms:**
```
error: Failed to start server. Is port 5555 in use?
code: "EADDRINUSE"
```

**Cause:** A previous server instance is still running.

**Solution:**

```bash
# Find and kill the process using port 5555
lsof -i :5555 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Then restart
bun run dev
```

### Issue: Migration Says "Objects Already Exist" But Tables Missing

**Symptoms:**
- Server logs: `[DB] Migration skipped - objects already exist (safe to ignore)`
- But queries fail with "relation does not exist"

**Cause:** The Drizzle migration tracking table exists but the actual tables don't, or there's a mismatch between migration state and actual schema.

**Solution:**

1. Check what actually exists:
   ```bash
   docker exec hyperscape-postgres psql -U hyperscape -d hyperscape -c "\dt"
   ```

2. If tables are missing, force a schema push:
   ```bash
   cd packages/server
   bunx drizzle-kit push
   ```

3. If you want a completely fresh start:
   ```bash
   # Stop server first
   docker stop hyperscape-postgres
   docker rm hyperscape-postgres
   docker volume rm hyperscape-postgres-data
   
   # Restart server (will recreate everything)
   bun run dev
   ```

### Issue: "spawn" Config Not Found Warning

**Symptoms:**
```
[InitializationManager] Error loading spawn point, using default:
```

**Cause:** The `config` table is empty. This is a warning, not an error - the server falls back to a default spawn point.

**Note:** This warning is harmless. The server will use the default spawn point `[0, 50, 0]`.

## Database Configuration

### Default Credentials

When using `USE_LOCAL_POSTGRES=true` (the default), these credentials are used:

| Setting | Default Value |
|---------|---------------|
| Container | `hyperscape-postgres` |
| User | `hyperscape` |
| Password | `hyperscape_dev` |
| Database | `hyperscape` |
| Port | `5432` |

### Environment Variables

Set these in `packages/server/.env` if you need to override defaults:

```bash
# Use local Docker PostgreSQL (default: true)
USE_LOCAL_POSTGRES=true

# Or specify explicit connection string
DATABASE_URL=postgresql://user:password@host:port/database

# Docker container settings (only used when USE_LOCAL_POSTGRES=true)
POSTGRES_CONTAINER=hyperscape-postgres
POSTGRES_USER=hyperscape
POSTGRES_PASSWORD=hyperscape_dev
POSTGRES_DB=hyperscape
POSTGRES_PORT=5432
```

## Useful Commands

```bash
# Connect to PostgreSQL CLI
docker exec -it hyperscape-postgres psql -U hyperscape -d hyperscape

# View all tables
\dt

# Describe a table
\d users

# Run a query
SELECT * FROM config;

# Exit
\q
```

## Getting Help

If you're still having issues:
1. Check the server logs for specific error messages
2. Ensure Docker is running: `docker info`
3. Try a fresh database (see "Fresh Start" solution above)
