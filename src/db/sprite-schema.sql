-- SQLite schema for per-sprite state (each race sprite has its own SQLite database)
-- This stores private state that only this race knows about

-- Full conversation history from this race's perspective
CREATE TABLE IF NOT EXISTS conversation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_type TEXT NOT NULL, -- 'received_public', 'received_secret', 'sent_public', 'sent_secret'
  from_race TEXT NOT NULL,
  to_race TEXT NOT NULL,
  content TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  created_at INTEGER NOT NULL -- Unix timestamp
);

-- Index for fetching recent history
CREATE INDEX IF NOT EXISTS idx_conversation_day ON conversation_history(day_number DESC);

-- Relationship tracking with other races
CREATE TABLE IF NOT EXISTS relationships (
  race_id TEXT PRIMARY KEY,
  trust_level INTEGER DEFAULT 0, -- -100 to 100
  is_ally INTEGER DEFAULT 0, -- Boolean (0 or 1)
  is_enemy INTEGER DEFAULT 0, -- Boolean (0 or 1)
  notes TEXT, -- LLM-generated notes about this race
  last_updated_day INTEGER
);

-- Current goals and strategies
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  priority INTEGER DEFAULT 5, -- 1-10
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'abandoned'
  created_day INTEGER NOT NULL,
  completed_day INTEGER
);

-- Index for fetching active goals
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);

-- Hidden agendas and secrets this race is keeping
CREATE TABLE IF NOT EXISTS secrets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_day INTEGER NOT NULL,
  revealed INTEGER DEFAULT 0 -- Boolean (0 or 1)
);

-- Personality evolution (tracks how this race's personality changes over time)
CREATE TABLE IF NOT EXISTS personality_state (
  key TEXT PRIMARY KEY,
  value REAL NOT NULL,
  last_updated_day INTEGER
);

-- Sprite metadata (tracks last processed day to avoid reprocessing)
CREATE TABLE IF NOT EXISTS sprite_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Initialize sprite metadata with last_processed_day
INSERT OR IGNORE INTO sprite_metadata (key, value) VALUES ('last_processed_day', '-1');

-- Resources: virtual currency/assets this race owns
CREATE TABLE IF NOT EXISTS resources (
  resource_type TEXT PRIMARY KEY,
  amount INTEGER NOT NULL DEFAULT 0
);

-- Initialize starting resources
INSERT OR IGNORE INTO resources (resource_type, amount) VALUES
  ('energy', 10000),
  ('intelligence', 0),
  ('influence', 100);

-- Stolen secrets: intel stolen from other races
CREATE TABLE IF NOT EXISTS stolen_secrets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  about_race TEXT NOT NULL,
  secret_data TEXT NOT NULL,
  stolen_at INTEGER NOT NULL -- Unix timestamp
);
