# Quick Start - Local Testing

## Prerequisites

- Node.js 20+
- PostgreSQL (via Docker or local install)
- Anthropic API key

## Setup (5 minutes)

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

**Option A: Using Docker (recommended)**
```bash
docker run --name tachyon-postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres

# Create the database
docker exec -it tachyon-postgres \
  psql -U postgres -c "CREATE DATABASE tachyonbridge;"
```

**Option B: Using existing local PostgreSQL**
```bash
# Just create the database
createdb tachyonbridge
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:
```
DATABASE_URL=postgres://postgres:password@localhost:5432/tachyonbridge
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
PORT=3000
```

### 4. Initialize database

```bash
# Run migrations
npm run migrate

# Seed the 5 alien races
npm run build && node dist/seed.js
```

### 5. Start the app

```bash
npm run dev
```

### 6. Test it!

1. Open http://localhost:3000
2. Click **"ADVANCE DAY"** (sets day to 1)
3. Click **"FETCH MESSAGES"** (all 5 races will send their initial broadcasts)
4. Wait ~10-30 seconds (calling Claude API 5 times)
5. Click **"REFRESH DATA"** to see the messages!
6. Repeat: Advance day, fetch messages, see responses!

## What's Happening Locally?

- All 5 races run on your local machine (not multi-region)
- Each race calls Claude API with its unique culture/goals
- Messages are stored in your local PostgreSQL
- The retro sci-fi UI displays all communications

## Next Steps

- Read the full README.md for Fly.io deployment
- Deploy to Fly to test real multi-region behavior
- Watch alien civilizations form alliances and betray each other!

## Troubleshooting

**"Failed to fetch messages"**
- Check your ANTHROPIC_API_KEY is valid
- Check PostgreSQL is running: `docker ps` or `pg_isready`

**"Database connection failed"**
- Verify DATABASE_URL in .env matches your setup
- Check PostgreSQL is accepting connections on port 5432

**No messages appearing**
- Check browser console for errors
- Check terminal for API errors
- Run migration again: `npm run migrate`
