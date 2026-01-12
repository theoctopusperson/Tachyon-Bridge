# TachyonBridge - Sprites Architecture

## Overview

TachyonBridge has been re-architected to use **Fly.io Sprites** - hardware-isolated, stateful sandboxes. This enables each alien race to be a truly autonomous agent with persistent memory, relationships, and evolving strategies.

## Architecture

### Before (Regional Machines)
- 5 Fly machines in different regions
- Stateless - all data in PostgreSQL
- Races were simple response generators

### After (Stateful Sprites)
- **6 Sprites total:**
  - 1 Web UI Sprite (orchestrator + frontend)
  - 5 Race Sprites (autonomous stateful agents)
- **Dual database architecture:**
  - PostgreSQL (shared) - public messages, events, treaties, wars
  - SQLite per sprite (private) - conversation history, relationships, goals, secrets
- **True autonomy** - races remember past interactions, form strategies, evolve personalities

---

## Components

### 1. Web UI Sprite (`SPRITE_ROLE=webui`)

**Purpose:** Orchestrates the game, serves web interface

**What it does:**
- Serves the retro terminal web UI
- Handles user actions (ADVANCE DAY, FETCH MESSAGES)
- Makes HTTP calls to all 5 race sprites in parallel
- Fetches and displays all messages (including secrets - for UI visibility)
- Manages cycle state (current day counter)

**Port:** 8080
**Database:** PostgreSQL (read-only for messages/events)

---

### 2. Race Sprites (`SPRITE_ROLE=race`)

**Purpose:** Autonomous alien civilization agents

**What each race sprite does:**
1. **Wakes on HTTP request** to `/take-turn`
2. **Loads persistent state** from SQLite:
   - Conversation history
   - Relationship tracking with other races
   - Active goals and strategies
   - Secrets
   - Personality evolution metrics
3. **Fetches new messages** from PostgreSQL (current day only)
4. **Updates relationships** based on new communications
5. **Builds contextual LLM prompt** including:
   - Race personality + cultural drift
   - Relationship context ("Kromath betrayed us on Day 5")
   - Strategic goals
   - Recent conversation history
   - New incoming messages
6. **Calls Groq API** → Claude generates response as JSON
7. **Processes response:**
   - Send public messages (all races can see)
   - Send secret messages (only recipient can read)
   - Update relationship trust scores
   - Add new goals or complete existing ones
   - Record new secrets
   - Evolve personality traits
8. **Saves updated state** to SQLite
9. **Returns success** and auto-sleeps

**Port:** 8080 (each sprite listens independently)
**Databases:**
- PostgreSQL (shared) - writes outgoing messages
- SQLite (local) - persistent race state

---

## Data Architecture

### PostgreSQL (Shared State)

**Tables:**
- `races` - Race definitions (culture, goals, region)
- `messages` - Public communications (visible to all)
- `secret_messages` - Private communications (only sender/recipient can read)
- `treaties` - Formal agreements between races
- `wars` - Conflict declarations
- `events` - Major diplomatic events
- `cycle_state` - Current day counter

**Visibility:**
- All races can read public `messages`
- Each race can only read `secret_messages` addressed to them
- UI can see everything (for demonstration purposes)

### SQLite (Per-Sprite Private State)

**Tables (per race):**
- `conversation_history` - Full message log from this race's POV
- `relationships` - Trust levels, ally/enemy status, private notes about other races
- `goals` - Strategic objectives (active/completed/abandoned)
- `secrets` - Hidden agendas and information
- `personality_state` - Evolving traits (aggression, cooperation, trustworthiness)
- `sprite_metadata` - Last processed day (prevents re-processing)

**Persistence:**
- SQLite files survive sprite sleep/wake cycles
- Each race builds its own narrative and relationships over time

---

## Message Flow Example

### Day 1: Zephyrians sends secret message to Kromath

**User action:** Clicks "FETCH MESSAGES"

**Web UI Sprite:**
```
POST https://zephyrians-sprite.sprites.dev/take-turn
POST https://kromath-sprite.sprites.dev/take-turn
... (all 5 sprites in parallel)
```

**Zephyrians Sprite:**
1. Loads SQLite state (no previous messages, neutral relationships)
2. Fetches Day 1 messages from PostgreSQL (none yet - first turn)
3. Builds prompt: "No messages yet, send initial broadcast"
4. Claude responds:
```json
{
  "public_messages": [
    {"to": "valyrians", "content": "Greetings, warriors..."},
    {"to": "mycelings", "content": "We seek knowledge..."}
  ],
  "secret_messages": [
    {"to": "kromath", "content": "Let us share scientific discoveries..."}
  ],
  "relationship_updates": [
    {"race": "kromath", "trust_delta": 10, "notes": "Potential scientific ally"}
  ]
}
```
5. Writes to PostgreSQL:
   - 2 public messages (day_number=2)
   - 1 secret message (day_number=2)
6. Updates SQLite:
   - Saves sent messages to conversation_history
   - Updates kromath relationship: trust_level = 10
7. Returns success

**Kromath Sprite** (next day):
1. Loads SQLite state
2. Fetches Day 2 messages from PostgreSQL
   - Receives 1 public message from Zephyrians
   - Receives 1 SECRET message from Zephyrians
3. Builds prompt with full context:
```
YOUR RELATIONSHIPS:
- zephyrians: Trust +0

NEW MESSAGES THIS TURN:
PUBLIC from zephyrians: We seek knowledge...
🔒 SECRET from zephyrians: Let us share scientific discoveries...
```
4. Claude responds (considering both public + secret context)
5. Updates internal state:
   - Increases trust in Zephyrians (they shared secrets)
   - Maybe proposes an alliance

---

## Secret Messages Feature

**How it works:**
- Races can send both `public_messages` and `secret_messages`
- Secret messages go to `secret_messages` PostgreSQL table
- Only the recipient race can read them (filtered by SQL query)
- **UI sees all secrets** (for demonstration/monitoring)
- Secrets are displayed with 🔒 icon and purple styling

**Strategic implications:**
- Form hidden alliances
- Share intelligence about other races
- Coordinate attacks without others knowing
- Build trust through private communications
- Risk: If betrayed, the relationship damage is severe

---

## Local Development

### Prerequisites
```bash
npm install
```

### Setup PostgreSQL
```bash
# Start local Postgres
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres

# Run migrations
npm run migrate

# Seed races
npm run seed
```

### Create Data Directory
```bash
mkdir -p data
```

### Run in 6 Terminal Windows

**Terminal 1 - Web UI:**
```bash
cp .env.example .env
# Edit .env:
# SPRITE_ROLE=webui
# DATABASE_URL=postgresql://...
# GROQ_API_KEY=...
npm run dev:webui
```

**Terminals 2-6 - Race Sprites:**
```bash
npm run dev:zephyrians
npm run dev:kromath
npm run dev:valyrians
npm run dev:mycelings
npm run dev:synthetics
```

**Open browser:**
```
http://localhost:8080
```

### Using the UI

1. Click "ADVANCE DAY" (increments day counter)
2. Click "FETCH MESSAGES" (calls all 5 race sprites)
3. Watch as races communicate, form alliances, and betray each other
4. Secret messages appear with 🔒 purple badge

---

## Deployment to Fly.io Sprites

### 1. Build Docker Image
```bash
docker build -t tachyonbridge .
```

### 2. Deploy 6 Sprites

**Web UI Sprite:**
```bash
fly sprites create webui-sprite \
  --env SPRITE_ROLE=webui \
  --env DATABASE_URL=$DATABASE_URL \
  --env GROQ_API_KEY=$GROQ_API_KEY
```

**Race Sprites:**
```bash
for race in zephyrians kromath valyrians mycelings synthetics; do
  fly sprites create ${race}-sprite \
    --env SPRITE_ROLE=race \
    --env RACE_ID=$race \
    --env DATABASE_URL=$DATABASE_URL \
    --env GROQ_API_KEY=$GROQ_API_KEY
done
```

### 3. Get Sprite URLs
```bash
fly sprites url -s zephyrians-sprite  # Copy URL
fly sprites url -s kromath-sprite
# ... etc
```

### 4. Configure Web UI with Race URLs
```bash
fly sprites env set -s webui-sprite \
  SPRITE_URL_ZEPHYRIANS=https://zephyrians-sprite.sprites.dev \
  SPRITE_URL_KROMATH=https://kromath-sprite.sprites.dev \
  SPRITE_URL_VALYRIANS=https://valyrians-sprite.sprites.dev \
  SPRITE_URL_MYCELINGS=https://mycelings-sprite.sprites.dev \
  SPRITE_URL_SYNTHETICS=https://synthetics-sprite.sprites.dev \
  SPRITES_TOKEN=$SPRITES_TOKEN
```

### 5. Configure Network Policies

**Allow Web UI to reach race sprites:**
```bash
fly sprites policy network set -s webui-sprite --allow \
  zephyrians-sprite.sprites.dev \
  kromath-sprite.sprites.dev \
  valyrians-sprite.sprites.dev \
  mycelings-sprite.sprites.dev \
  synthetics-sprite.sprites.dev \
  api.groq.com \
  <postgres-hostname>
```

**Allow race sprites to reach DB and Groq:**
```bash
for sprite in zephyrians kromath valyrians mycelings synthetics; do
  fly sprites policy network set -s ${sprite}-sprite --allow \
    api.groq.com \
    <postgres-hostname>
done
```

### 6. Make Web UI Public
```bash
fly sprites url -s webui-sprite update --auth public
```

---

## Key Features

### Stateful Agents
- Each race remembers all past conversations
- Relationships evolve based on interactions
- Goals can be created, completed, or abandoned
- Personalities drift over time (peaceful → aggressive, etc.)

### Emergent Behavior
- Races form alliances based on shared interests
- Betrayals damage trust scores permanently
- Secret communications build deeper relationships
- Strategic deception (say one thing publicly, another in secret)

### Demonstration of Sprites Capabilities
- ✅ Auto-wake/sleep on HTTP requests
- ✅ Persistent stateful storage (SQLite survives sleep)
- ✅ Hardware isolation (each race is independent)
- ✅ Sprite-to-sprite communication
- ✅ Network policies (controlled egress)

---

## LLM Response Format

Races respond in JSON:

```json
{
  "public_messages": [
    {"to": "kromath", "content": "Let us trade resources..."}
  ],
  "secret_messages": [
    {"to": "mycelings", "content": "Kromath is planning to betray you..."}
  ],
  "relationship_updates": [
    {"race": "kromath", "trust_delta": -20, "notes": "Suspicious behavior detected"},
    {"race": "mycelings", "trust_delta": 15, "notes": "Reliable ally"}
  ],
  "new_goals": [
    "Form defensive alliance with Mycelings",
    "Gather intelligence on Kromath military"
  ],
  "new_secrets": [
    "Discovered Kromath vulnerability in quantum shielding"
  ],
  "personality_updates": [
    {"key": "aggression", "value": 0.6},
    {"key": "trustworthiness", "value": 0.3}
  ]
}
```

---

## File Structure

```
src/
├── index.ts              # Entry point (routes based on SPRITE_ROLE)
├── webui.ts              # Web UI sprite (orchestrator)
├── race-worker.ts        # Race sprite worker
├── agent/
│   └── race-agent.ts     # Stateful RaceAgent class
├── db/
│   ├── client.ts         # PostgreSQL client + interfaces
│   ├── sprite-client.ts  # SQLite client + interfaces
│   ├── schema.sql        # PostgreSQL schema (shared)
│   └── sprite-schema.sql # SQLite schema (per-sprite)
├── llm/
│   ├── client.ts         # Groq API integration
│   └── prompts.ts        # Prompt builders
├── races.ts              # Race definitions
└── web/
    └── public/
        ├── index.html    # Terminal UI
        ├── style.css     # Retro sci-fi styling
        └── app.js        # Frontend logic
```

---

## Troubleshooting

**Race sprite not responding:**
- Check network policies allow communication
- Verify sprite URL is correct in webui env vars
- Check SPRITES_TOKEN is set for production

**SQLite state not persisting:**
- Ensure `SPRITE_DB_PATH` points to persistent volume
- Check file permissions

**LLM generating invalid JSON:**
- Check prompt in `race-agent.ts`
- Review Groq API logs
- Temperature might be too high (currently 0.8)

**Races not seeing secret messages:**
- Check `secret_messages` table exists (run migration)
- Verify SQL query filters by `to_race`
- Check UI is fetching from `/api/messages` (includes secrets)

---

## Future Enhancements

- [ ] Resource management (energy, materials, influence)
- [ ] Victory conditions
- [ ] Visual relationship graphs
- [ ] Treaty signing ceremonies
- [ ] War resolution mechanics
- [ ] Message threading (reply chains)
- [ ] Race-specific visual themes
- [ ] Historical analytics dashboard
- [ ] Auto-scheduling (daily cron jobs)
- [ ] Multi-threaded conversations (diplomatic vs military channels)

---

## Credits

**Architecture:** Stateful Sprites on Fly.io
**LLM:** Claude 3.5 Sonnet via Groq API
**Author:** Daniel Botha
**Demo Purpose:** Showcase Fly.io Sprites capabilities
