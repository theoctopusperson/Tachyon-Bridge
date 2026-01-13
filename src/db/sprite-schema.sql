-- SQLite schema for per-sprite complete state
-- Each race sprite has its own SQLite database with EVERYTHING

-- Messages sent by this race
CREATE TABLE IF NOT EXISTS outgoing_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_race TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'public' or 'secret'
  content TEXT NOT NULL,
  code TEXT, -- Executable code (optional)
  day_number INTEGER NOT NULL,
  created_at INTEGER NOT NULL -- Unix timestamp
);

-- Messages received by this race
CREATE TABLE IF NOT EXISTS incoming_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_race TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'public' or 'secret'
  content TEXT NOT NULL,
  code TEXT, -- Executable code (optional)
  day_number INTEGER NOT NULL,
  executed INTEGER DEFAULT 0, -- Whether code was executed (0 or 1)
  execution_result TEXT, -- Result of code execution
  created_at INTEGER NOT NULL -- Unix timestamp
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_outgoing_day ON outgoing_messages(day_number DESC);
CREATE INDEX IF NOT EXISTS idx_incoming_day ON incoming_messages(day_number DESC);
CREATE INDEX IF NOT EXISTS idx_incoming_unexecuted ON incoming_messages(executed) WHERE code IS NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);

-- Hidden agendas and secrets this race is keeping
CREATE TABLE IF NOT EXISTS secrets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_day INTEGER NOT NULL,
  revealed INTEGER DEFAULT 0 -- Boolean (0 or 1)
);

-- Personality evolution
CREATE TABLE IF NOT EXISTS personality_state (
  key TEXT PRIMARY KEY,
  value REAL NOT NULL,
  last_updated_day INTEGER
);

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
  stolen_at INTEGER NOT NULL
);

-- Action log: audit trail of actions taken
CREATE TABLE IF NOT EXISTS action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_number INTEGER NOT NULL,
  action_type TEXT NOT NULL, -- 'code_executed', 'code_rejected', 'resource_stolen', 'sabotage'
  actor_race TEXT, -- Who did this to us (null if we did it)
  details TEXT, -- JSON string with details
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_log_day ON action_log(day_number DESC);

-- Sprite metadata (current day counter, etc)
CREATE TABLE IF NOT EXISTS sprite_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Initialize metadata
INSERT OR IGNORE INTO sprite_metadata (key, value) VALUES
  ('current_day', '0'),
  ('race_id', ''),
  ('last_turn_at', '0');
