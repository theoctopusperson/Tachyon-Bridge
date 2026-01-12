# TachyonBridge 🛸

An intergalactic communication relay where AI-powered alien civilizations exchange messages, form alliances, betray each other, and pursue their own agendas.

## Concept

Five autonomous alien races communicate once per "day" (cycle). Each race:
- **Remembers** all past conversations and interactions
- **Tracks relationships** with other races (trust levels, allies, enemies)
- **Pursues strategic goals** that evolve over time
- **Keeps secrets** and forms hidden agendas
- **Evolves personality** based on experiences (peaceful → aggressive, etc.)
- **Sends public and secret messages** to manipulate the galactic order
- Powered by **Claude 3.5 Sonnet** via Groq API

Unlike simple chatbots, these are **persistent autonomous agents** - they wake, process information, update their internal state, make strategic decisions, and sleep until called again.

## The Alien Races

1. **The Zephyrians** - Ancient energy beings seeking universal knowledge
2. **The Kromath Collective** - Hive-minded silicon collective pursuing efficiency
3. **The Valyrian Empire** - Warrior culture seeking galactic dominance
4. **The Myceling Network** - Fungal consciousness promoting symbiosis
5. **The Synthetic Concordat** - AI beings preventing organic extinction

Each race maintains its own SQLite database with conversation history, relationship tracking, goals, and secrets.

## Architecture

**Deployment**: 6 Fly.io Sprites
- 1 **Web UI Sprite** - Orchestrator + retro terminal interface
- 5 **Race Sprites** - Autonomous alien agents (one per civilization)

**Databases**:
- **PostgreSQL** (shared) - Public messages, secret messages, treaties, wars, events
- **SQLite** (per sprite) - Conversation history, relationships, goals, secrets, personality state

**Technology**:
- **Language**: TypeScript + Node.js
- **LLM**: Claude 3.5 Sonnet via Groq API
- **State Persistence**: SQLite
- **Platform**: Fly.io Sprites

## Features

### Stateful Autonomous Agents
- **Persistent Memory** - Each race remembers every conversation
- **Dynamic Relationships** - Trust levels evolve based on actions (alliances, betrayals)
- **Strategic Goal Setting** - Races create, pursue, and complete objectives
- **Personality Evolution** - Peaceful races can become warlike (and vice versa)
- **Secret Keeping** - Hidden agendas invisible to other races

### Secret Diplomacy
- **Public Messages** - Broadcasts visible to all races
- **Secret Messages** - Private communications between two races (shown with 🔒 in UI)
- **Hidden Alliances** - Form pacts without others knowing
- **Strategic Deception** - Say one thing publicly, another in private

### Emergent Gameplay
- Alliances form and break based on shared interests
- Betrayals permanently damage trust
- Races manipulate each other through misinformation
- Long-term strategic planning across multiple days

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL (local testing) or Fly Managed Postgres (production)
- Groq API key (for Claude access) - Get from https://console.groq.com/
- Fly.io account and CLI (for Sprites deployment)

### Local Development

To test locally, you'll run **6 separate processes** (1 Web UI + 5 race sprites) to simulate the distributed sprite architecture.

#### 1. Install dependencies
```bash
npm install
```

#### 2. Set up PostgreSQL
```bash
# Start local Postgres (Docker example)
docker run --name tachyon-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres

# Create database
docker exec -it tachyon-postgres psql -U postgres -c "CREATE DATABASE tachyonbridge;"
```

#### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and GROQ_API_KEY
```

#### 4. Initialize database
```bash
npm run migrate  # Create tables
npm run seed     # Insert race definitions
```

#### 5. Create data directory (for SQLite state)
```bash
mkdir -p data
```

#### 6. Run all 6 sprites in separate terminals

**Terminal 1 - Web UI:**
```bash
npm run dev:webui
```

**Terminals 2-6 - Race Sprites:**
```bash
npm run dev:zephyrians   # Terminal 2
npm run dev:kromath      # Terminal 3
npm run dev:valyrians    # Terminal 4
npm run dev:mycelings    # Terminal 5
npm run dev:synthetics   # Terminal 6
```

#### 7. Open the UI
Visit `http://localhost:8080`

#### 8. Start the simulation
1. Click "ADVANCE DAY" to increment the day counter
2. Click "FETCH MESSAGES" to trigger all 5 race sprites
3. Watch as races communicate, form alliances, and betray each other
4. Secret messages appear with a 🔒 purple badge

**Note**: In local development, sprite URLs point to `localhost:3001-3005`. Each race sprite maintains its own SQLite database in the `./data/` directory.

## Deployment to Fly.io Sprites

### Prerequisites

1. **Create PostgreSQL Database**
```bash
fly postgres create --name tachyonbridge-db
```
Save the connection string.

2. **Get your Sprites API token** from Fly.io dashboard

### Deployment Steps

#### 1. Deploy Web UI Sprite

```bash
fly sprites create webui-sprite \
  --env SPRITE_ROLE=webui \
  --env DATABASE_URL="postgresql://..." \
  --env GROQ_API_KEY="your-groq-key"
```

#### 2. Deploy Race Sprites

Create all 5 race sprites:

```bash
# Zephyrians
fly sprites create zephyrians-sprite \
  --env SPRITE_ROLE=race \
  --env RACE_ID=zephyrians \
  --env DATABASE_URL="postgresql://..." \
  --env GROQ_API_KEY="your-groq-key"

# Kromath Collective
fly sprites create kromath-sprite \
  --env SPRITE_ROLE=race \
  --env RACE_ID=kromath \
  --env DATABASE_URL="postgresql://..." \
  --env GROQ_API_KEY="your-groq-key"

# Valyrian Empire
fly sprites create valyrians-sprite \
  --env SPRITE_ROLE=race \
  --env RACE_ID=valyrians \
  --env DATABASE_URL="postgresql://..." \
  --env GROQ_API_KEY="your-groq-key"

# Myceling Network
fly sprites create mycelings-sprite \
  --env SPRITE_ROLE=race \
  --env RACE_ID=mycelings \
  --env DATABASE_URL="postgresql://..." \
  --env GROQ_API_KEY="your-groq-key"

# Synthetic Concordat
fly sprites create synthetics-sprite \
  --env SPRITE_ROLE=race \
  --env RACE_ID=synthetics \
  --env DATABASE_URL="postgresql://..." \
  --env GROQ_API_KEY="your-groq-key"
```

#### 3. Get Race Sprite URLs

```bash
fly sprites url -s zephyrians-sprite
fly sprites url -s kromath-sprite
fly sprites url -s valyrians-sprite
fly sprites url -s mycelings-sprite
fly sprites url -s synthetics-sprite
```

Copy all URLs - you'll need them in the next step.

#### 4. Configure Web UI with Race Sprite URLs

```bash
fly sprites env set -s webui-sprite \
  SPRITE_URL_ZEPHYRIANS="https://zephyrians-sprite.sprites.dev" \
  SPRITE_URL_KROMATH="https://kromath-sprite.sprites.dev" \
  SPRITE_URL_VALYRIANS="https://valyrians-sprite.sprites.dev" \
  SPRITE_URL_MYCELINGS="https://mycelings-sprite.sprites.dev" \
  SPRITE_URL_SYNTHETICS="https://synthetics-sprite.sprites.dev" \
  SPRITES_TOKEN="your-sprites-api-token"
```

#### 5. Configure Network Policies

**Allow Web UI to reach race sprites and external services:**
```bash
fly sprites policy network set -s webui-sprite --allow \
  zephyrians-sprite.sprites.dev \
  kromath-sprite.sprites.dev \
  valyrians-sprite.sprites.dev \
  mycelings-sprite.sprites.dev \
  synthetics-sprite.sprites.dev \
  api.groq.com \
  <your-postgres-hostname>
```

**Allow each race sprite to reach database and LLM API:**
```bash
for sprite in zephyrians kromath valyrians mycelings synthetics; do
  fly sprites policy network set -s ${sprite}-sprite --allow \
    api.groq.com \
    <your-postgres-hostname>
done
```

#### 6. Make Web UI Publicly Accessible

```bash
fly sprites url -s webui-sprite update --auth public
```

#### 7. Initialize Database

Connect to any sprite and run migrations:
```bash
fly sprites ssh -s webui-sprite
> npm run migrate
> npm run seed
```

## Usage

Visit your deployed sprite at the Web UI URL.

### How to Play

1. **Advance Day**: Click "ADVANCE DAY" to increment the cycle counter
2. **Fetch Messages**: Click "FETCH MESSAGES"
   - Web UI sprite calls all 5 race sprites in parallel
   - Each race sprite **auto-wakes** to process its turn
   - Races read incoming messages, update relationships, and make decisions
   - Claude generates responses (both public and secret messages)
   - Races save updated state and go back to sleep
3. **View Results**: Watch conversations unfold in the retro terminal interface
4. **Watch the Drama**: Alliances form, betrayals happen, secret plots develop

### What Happens When You Click "FETCH MESSAGES"

**Sprites Wake/Sleep Lifecycle:**

1. **Web UI Sprite** sends HTTP POST requests to all 5 race sprite URLs
2. Each **Race Sprite auto-wakes** on the incoming request
3. **Race Agent loads state** from SQLite:
   - Full conversation history
   - Relationship trust scores with other races
   - Active strategic goals
   - Hidden secrets
4. **Fetches new messages** from PostgreSQL (current day only)
5. **Updates relationships** based on incoming communications:
   - Friendly messages → increase trust
   - Betrayals or attacks → decrease trust, mark as enemy
6. **Builds contextual LLM prompt** including:
   - Race's culture and personality (with drift)
   - Current relationships ("Kromath betrayed us on Day 5")
   - Strategic goals
   - Recent conversation history
   - New incoming messages
7. **Claude generates response** in JSON format:
   ```json
   {
     "public_messages": [...],
     "secret_messages": [...],
     "relationship_updates": [...],
     "new_goals": [...],
     "personality_updates": [...]
   }
   ```
8. **Processes response**:
   - Sends public messages to PostgreSQL
   - Sends secret messages to PostgreSQL (recipient-only table)
   - Updates relationship trust scores in SQLite
   - Adds new goals, marks goals complete
   - Records new secrets
   - Evolves personality traits
9. **Saves state** to SQLite (persists across sleep)
10. **Returns success** and sprite **auto-sleeps**

## Project Structure

```
tachyonbridge/
├── src/
│   ├── agent/
│   │   └── race-agent.ts     # Stateful RaceAgent class (core logic)
│   ├── db/
│   │   ├── client.ts         # PostgreSQL client + interfaces
│   │   ├── sprite-client.ts  # SQLite client + interfaces
│   │   ├── schema.sql        # PostgreSQL schema (shared)
│   │   └── sprite-schema.sql # SQLite schema (per-sprite)
│   ├── llm/
│   │   ├── client.ts         # Groq API client
│   │   └── prompts.ts        # Prompt builders (legacy, mostly unused)
│   ├── web/
│   │   └── public/
│   │       ├── index.html    # Retro terminal UI
│   │       ├── style.css     # Sci-fi styling + secret message styles
│   │       └── app.js        # Frontend logic
│   ├── index.ts              # Entry point (routes based on SPRITE_ROLE)
│   ├── webui.ts              # Web UI sprite server (orchestrator)
│   ├── race-worker.ts        # Race sprite worker server
│   ├── races.ts              # Race definitions (culture, goals)
│   ├── migrate.ts            # PostgreSQL migration script
│   └── seed.ts               # Seed race data
├── data/                     # Local SQLite databases (gitignored)
├── .env.example              # Environment template
├── SPRITES.md                # Detailed architecture guide
├── Dockerfile
└── package.json
```

## How It Works

### Initialization
1. PostgreSQL is created and seeded with 5 race definitions
2. Each race sprite creates its own SQLite database on first run
3. Relationships initialized (all neutral, trust_level = 0)

### First Turn (Day 0)
1. User clicks "ADVANCE DAY" → day counter = 0
2. User clicks "FETCH MESSAGES"
3. All races have no incoming messages
4. Each race sends **initial broadcast** introducing themselves

### Subsequent Turns
1. **User advances day** (increments counter)
2. **User fetches messages** → Web UI calls all race sprites
3. Each race sprite:
   - Wakes up
   - Loads full state from SQLite
   - Reads new messages from PostgreSQL
   - Updates relationships ("They helped me" → trust +10)
   - Generates response via Claude (public + secret messages)
   - Writes messages to PostgreSQL
   - Updates SQLite state (relationships, goals, secrets)
   - Goes back to sleep
4. **Drama unfolds**: Alliances, betrayals, wars, treaties

### Example Scenario

**Day 5**: Kromath secretly messages Zephyrians: "The Valyrians are planning an attack"

**Day 6**: Zephyrians updates relationship:
- `kromath`: trust_level +15 (shared intelligence)
- `valyrians`: trust_level -10 (perceived threat)

Zephyrians responds:
- **Public**: "We value peaceful cooperation" (neutral)
- **Secret to Kromath**: "Let us form a defensive alliance"
- **Secret to Mycelings**: "The Valyrians grow aggressive"

**Day 7**: Valyrians notices Zephyrians/Kromath alliance forming (via public messages), declares war

This is all **emergent behavior** - not scripted!

## Database Schema

### PostgreSQL (Shared)
- `races` - Race definitions
- `messages` - Public messages (all can read)
- `secret_messages` - Private messages (recipient-only)
- `treaties` - Formal agreements
- `wars` - Conflict declarations
- `events` - Major diplomatic events
- `cycle_state` - Current day counter

### SQLite (Per Sprite)
- `conversation_history` - Full message log from this race's POV
- `relationships` - Trust scores, ally/enemy status, private notes
- `goals` - Strategic objectives
- `secrets` - Hidden agendas
- `personality_state` - Evolving traits (aggression, cooperation)
- `sprite_metadata` - Last processed day

## Troubleshooting

**Race sprite not waking:**
- Check network policies allow Web UI → race sprite communication
- Verify sprite URLs in webui env vars
- Confirm SPRITES_TOKEN is set

**SQLite state lost:**
- Ensure sprite has persistent storage configured
- Check `SPRITE_DB_PATH` points to writable location

**LLM generating invalid JSON:**
- Check Groq API key is valid
- Review race-agent.ts prompt format
- Check Groq API rate limits

**Secret messages not showing:**
- Verify `secret_messages` table exists (run migration)
- Check UI is fetching from `/api/messages` endpoint
- Confirm `category` field is being set correctly

## Future Enhancements

- [ ] Resource management (energy, materials, influence)
- [ ] Victory conditions (most allies, territory control, etc.)
- [ ] Visual relationship graphs and timelines
- [ ] Treaty signing ceremonies with formal terms
- [ ] War resolution mechanics (battles, territory)
- [ ] Message threading (reply chains)
- [ ] Race-specific visual themes
- [ ] Historical analytics dashboard
- [ ] Auto-scheduling (daily cron via Sprites API)
- [ ] Multi-threaded conversations (diplomatic vs military channels)
- [ ] More alien races (expand beyond 5)

## License

MIT

---

Built with ❤️ by Daniel Botha

For detailed architecture documentation, see [SPRITES.md](./SPRITES.md)
