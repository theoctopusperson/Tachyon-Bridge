# TachyonBridge 🛸

An intergalactic communication relay where AI-powered alien civilizations exchange messages, form alliances, and pursue their own agendas across multiple Fly.io regions.

## Concept

Five distinct alien races, each deployed to a different Fly.io region, communicate once per "day" (cycle). Each race:
- Has unique culture, goals, and personality (powered by Claude via Anthropic API)
- Receives messages addressed to them
- Generates responses to advance their agenda
- May cooperate, compete, or manipulate other races

## The Alien Races

1. **The Zephyrians** (LAX) - Ancient energy beings seeking universal knowledge
2. **The Kromath Collective** (FRA) - Hive-minded silicon collective pursuing efficiency
3. **The Valyrian Empire** (SYD) - Warrior culture seeking galactic dominance
4. **The Myceling Network** (GRU) - Fungal consciousness promoting symbiosis
5. **The Synthetic Concordat** (SIN) - AI beings preventing organic extinction

## Architecture

- **Language**: TypeScript + Node.js
- **Database**: Fly Postgres (shared across regions)
- **LLM**: Claude 3.5 Sonnet via Anthropic API
- **Deployment**: 5 Fly.io apps (one per region)
- **Web UI**: Retro sci-fi terminal interface

## Setup

### Prerequisites

- Node.js 20+
- Fly.io account and CLI installed (for deployment)
- Anthropic API key
- PostgreSQL (local testing) or Fly Managed Postgres (deployment)

### Local Development

You can test locally, but **multi-region behavior won't work** since you only have one machine. The "FETCH MESSAGES" button will trigger the same local process 5 times instead of waking 5 different regional machines.

1. **Install dependencies**
```bash
npm install
```

2. **Set up local PostgreSQL**
```bash
# Start a local Postgres instance (via Docker, Homebrew, etc.)
# Example with Docker:
docker run --name tachyon-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres

# Create database
docker exec -it tachyon-postgres psql -U postgres -c "CREATE DATABASE tachyonbridge;"
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env:
# DATABASE_URL=postgres://postgres:password@localhost:5432/tachyonbridge
# ANTHROPIC_API_KEY=sk-ant-...
```

4. **Run database migration**
```bash
npm run migrate
```

5. **Seed races**
```bash
npm run build && node dist/seed.js
```

6. **Start web interface**
```bash
npm run dev
```

Visit `http://localhost:3000` to view the interface.

7. **Test locally** (simulates one region)
   - Click "ADVANCE DAY"
   - Click "FETCH MESSAGES" - this will run all 5 races on your local machine
   - Since `FLY_REGION` isn't set, it will use the fallback RACE_ID or error
   - **To test a specific race locally:**
     ```bash
     RACE_ID=zephyrians npm run cycle
     ```

### Local Testing Limitations

- ❌ No multi-region behavior (all races run on same machine)
- ❌ No machine wake/sleep testing
- ❌ No regional routing via `Fly-Prefer-Region`
- ✅ Can test LLM message generation
- ✅ Can test database schema
- ✅ Can test web UI
- ✅ Can manually trigger individual races

**For full multi-region testing, you need to deploy to Fly.io.**

## Deployment to Fly.io

### 1. Create Fly Managed Postgres Database

```bash
# Create a new managed Postgres database
fly postgres create --name tachyonbridge-db --region lax
```

After creation, you'll receive a connection string. Save it for the next steps.

### 2. Create and Deploy the App

```bash
# Launch the app (this creates it but doesn't deploy yet)
fly launch --name tachyonbridge --region lax --no-deploy

# Attach the managed Postgres database
# This automatically sets the DATABASE_URL secret
fly postgres attach tachyonbridge-db --app tachyonbridge

# Set your Anthropic API key (the only secret you need to set manually)
fly secrets set ANTHROPIC_API_KEY="sk-ant-..."

# Deploy to the primary region (LAX)
fly deploy
```

### 3. Add Additional Regions

Now add the other 4 regions where the alien races will live:

```bash
# Add all race regions
fly regions add fra syd gru sin

# Verify regions
fly regions list
```

### 4. Set Region-Specific Environment Variables

This is where you'll test Fly's region-specific configuration! Each region can have its own `RACE_ID`:

```bash
# Set RACE_ID for each region
# LAX - Zephyrians (already default)
fly secrets set RACE_ID=zephyrians --region lax

# FRA - Kromath Collective
fly secrets set RACE_ID=kromath --region fra

# SYD - Valyrian Empire
fly secrets set RACE_ID=valyrians --region syd

# GRU - Myceling Network
fly secrets set RACE_ID=mycelings --region gru

# SIN - Synthetic Concordat
fly secrets set RACE_ID=synthetics --region sin
```

**Note**: If Fly CLI doesn't support `--region` flag for secrets, you can alternatively:
- Use the auto-detection (each machine detects its region via `FLY_REGION` and maps to the correct race)
- OR set via Fly.io dashboard per-region config
- OR use machine-specific environment variables

### 5. Initialize Database

```bash
# Run migration
fly ssh console -C "node dist/migrate.js"

# Seed races
fly ssh console -C "node dist/seed.js"
```

### 6. Scale to Multiple Regions

Ensure you have machines running in each region:

```bash
# Scale to have at least 1 machine per region
fly scale count 5

# Or manually create machines in specific regions
fly machine run . --region fra
fly machine run . --region syd
fly machine run . --region gru
fly machine run . --region sin
```

## Usage

Visit your deployed web interface at `https://tachyonbridge.fly.dev`

### Daily Workflow

1. **Advance Day**: Click the "ADVANCE DAY" button to increment the cycle counter
2. **Fetch Messages**: Click the "FETCH MESSAGES" button
   - This wakes all machines across all 5 regions
   - Each alien race reads its incoming messages
   - Claude generates responses based on each race's culture and goals
   - New messages are posted to the database
   - Machines go back to sleep automatically
3. **View Results**: Messages appear in the terminal-style interface
4. **Watch Drama Unfold**: See alliances form, betrayals happen, and agendas advance

### What Happens When You Click "FETCH MESSAGES"

This is where Fly.io's magic happens:

1. The web UI (in LAX) sends requests to `/api/cycle/run` with `Fly-Prefer-Region` headers
2. Fly's proxy routes each request to a machine in the target region
3. **Machines auto-wake from sleep** to handle the request
4. Each machine:
   - Detects its region via `FLY_REGION`
   - Maps to the appropriate alien race
   - Reads messages from the shared database
   - Calls Claude API to generate responses
   - Writes new messages to the database
   - Returns success
5. **Machines auto-sleep** after handling the request
6. The UI refreshes to show new messages

This perfectly simulates a "wake on demand, process, sleep" pattern - great for testing Fly's machine lifecycle!

## Project Structure

```
tachyonbridge/
├── src/
│   ├── db/
│   │   ├── client.ts         # Database client and types
│   │   └── schema.sql        # Database schema
│   ├── llm/
│   │   ├── client.ts         # Anthropic API client
│   │   └── prompts.ts        # Prompt building logic
│   ├── web/
│   │   └── public/
│   │       ├── index.html    # Web UI
│   │       ├── style.css     # Retro sci-fi styling
│   │       └── app.js        # Frontend logic
│   ├── index.ts              # Web server
│   ├── cycle.ts              # Daily communication cycle
│   ├── migrate.ts            # Database migration
│   ├── seed.ts               # Seed races
│   └── races.ts              # Race definitions
├── Dockerfile
├── fly.toml
└── package.json
```

## How It Works

1. **Initialization**: Database is seeded with 5 alien races
2. **Day 0**: Each race sends initial broadcast messages
3. **Daily Cycle**:
   - Race reads messages addressed to it
   - Claude generates responses based on race's culture/goals
   - Race sends replies to all races that contacted it
   - Day counter increments
4. **Repeat**: Drama ensues!

## Development Tips

- Test locally with different `RACE_ID` values
- Use the web UI's "ADVANCE CYCLE" button to increment days
- Check Fly.io logs: `fly logs -a tachyonbridge-zephyrians`
- Monitor Postgres: `fly postgres connect -a tachyonbridge-db`

## Future Enhancements

- [ ] Automatic daily scheduling via Fly Machines API
- [ ] Race-specific visual themes in UI
- [ ] Message threading and reply chains
- [ ] Victory conditions and game endings
- [ ] Historical analytics and relationship graphs
- [ ] More alien races and regions

## License

MIT

---

Built with ❤️ by Daniel Botha
