-- Races table: defines each alien civilization
CREATE TABLE IF NOT EXISTS races (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  culture TEXT NOT NULL,
  goals TEXT NOT NULL,
  region VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Public messages table: visible communications between races
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  from_race VARCHAR(50) NOT NULL REFERENCES races(id),
  to_race VARCHAR(50) NOT NULL REFERENCES races(id),
  message_type VARCHAR(20) DEFAULT 'public',
  content TEXT NOT NULL,
  code TEXT, -- Executable code attached to message (optional)
  day_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Secret messages table: private communications (only sender/recipient can read, but UI shows all)
CREATE TABLE IF NOT EXISTS secret_messages (
  id SERIAL PRIMARY KEY,
  from_race VARCHAR(50) NOT NULL REFERENCES races(id),
  to_race VARCHAR(50) NOT NULL REFERENCES races(id),
  content TEXT NOT NULL,
  code TEXT, -- Executable code attached to message (optional)
  day_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Treaties table: formal agreements between races
CREATE TABLE IF NOT EXISTS treaties (
  id SERIAL PRIMARY KEY,
  race_a VARCHAR(50) NOT NULL REFERENCES races(id),
  race_b VARCHAR(50) NOT NULL REFERENCES races(id),
  treaty_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  terms TEXT,
  created_day INTEGER NOT NULL,
  broken_day INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('active', 'broken', 'expired'))
);

-- Wars table: conflict declarations between races
CREATE TABLE IF NOT EXISTS wars (
  id SERIAL PRIMARY KEY,
  aggressor VARCHAR(50) NOT NULL REFERENCES races(id),
  defender VARCHAR(50) NOT NULL REFERENCES races(id),
  status VARCHAR(20) DEFAULT 'ongoing',
  declaration TEXT,
  started_day INTEGER NOT NULL,
  ended_day INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('ongoing', 'ended'))
);

-- Events table: major diplomatic/strategic events
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  involved_races TEXT[] NOT NULL,
  description TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_to_race_day ON messages(to_race, day_number);
CREATE INDEX IF NOT EXISTS idx_messages_day ON messages(day_number);

-- Indexes for secret messages
CREATE INDEX IF NOT EXISTS idx_secret_messages_to_race_day ON secret_messages(to_race, day_number);
CREATE INDEX IF NOT EXISTS idx_secret_messages_day ON secret_messages(day_number);

-- Indexes for treaties
CREATE INDEX IF NOT EXISTS idx_treaties_race_a ON treaties(race_a);
CREATE INDEX IF NOT EXISTS idx_treaties_race_b ON treaties(race_b);
CREATE INDEX IF NOT EXISTS idx_treaties_status ON treaties(status);

-- Indexes for wars
CREATE INDEX IF NOT EXISTS idx_wars_aggressor ON wars(aggressor);
CREATE INDEX IF NOT EXISTS idx_wars_defender ON wars(defender);
CREATE INDEX IF NOT EXISTS idx_wars_status ON wars(status);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_events_day ON events(day_number);

-- Action log: audit trail of all code executions and attacks
CREATE TABLE IF NOT EXISTS action_log (
  id SERIAL PRIMARY KEY,
  day_number INTEGER NOT NULL,
  actor_race VARCHAR(50) REFERENCES races(id),
  target_race VARCHAR(50) REFERENCES races(id),
  action_type VARCHAR(50) NOT NULL, -- 'code_sent', 'code_executed', 'code_rejected', 'resource_stolen', 'sabotage'
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for action log
CREATE INDEX IF NOT EXISTS idx_action_log_day ON action_log(day_number);
CREATE INDEX IF NOT EXISTS idx_action_log_actor ON action_log(actor_race);
CREATE INDEX IF NOT EXISTS idx_action_log_target ON action_log(target_race);

-- Cycle state: tracks which day we're on
CREATE TABLE IF NOT EXISTS cycle_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_day INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMP,
  CHECK (id = 1)
);

-- Initialize cycle state
INSERT INTO cycle_state (id, current_day) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
