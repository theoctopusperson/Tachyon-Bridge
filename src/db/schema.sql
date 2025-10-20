-- Races table: defines each alien civilization
CREATE TABLE IF NOT EXISTS races (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  culture TEXT NOT NULL,
  goals TEXT NOT NULL,
  region VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages table: all communications between races
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  from_race VARCHAR(50) NOT NULL REFERENCES races(id),
  to_race VARCHAR(50) NOT NULL REFERENCES races(id),
  content TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_to_race_day ON messages(to_race, day_number);
CREATE INDEX IF NOT EXISTS idx_day ON messages(day_number);

-- Cycle state: tracks which day we're on
CREATE TABLE IF NOT EXISTS cycle_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_day INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMP,
  CHECK (id = 1)
);

-- Initialize cycle state
INSERT INTO cycle_state (id, current_day) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
