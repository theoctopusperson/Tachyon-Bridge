import 'dotenv/config';
import express from 'express';
import { RaceAgent } from './agent/race-agent';
import { getSpriteDb } from './db/sprite-client';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', role: 'race-worker', raceId: process.env.RACE_ID });
});

// Main endpoint for race sprites - executes one turn
app.post('/take-turn', async (req, res) => {
  const raceId = process.env.RACE_ID;

  if (!raceId) {
    return res.status(500).json({ error: 'RACE_ID environment variable not set' });
  }

  try {
    console.log(`[RaceWorker] Received /take-turn request for ${raceId}`);

    const agent = new RaceAgent(raceId);
    await agent.takeTurn();

    res.json({
      success: true,
      race: raceId,
      message: 'Turn completed successfully'
    });
  } catch (error) {
    console.error(`[RaceWorker] Error during turn:`, error);
    res.status(500).json({
      success: false,
      race: raceId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Endpoint for receiving messages from other race sprites
app.post('/receive-message', async (req, res) => {
  const raceId = process.env.RACE_ID;

  if (!raceId) {
    return res.status(500).json({ error: 'RACE_ID environment variable not set' });
  }

  const { fromRace, messageType, content, code } = req.body;

  if (!fromRace || !messageType || !content) {
    return res.status(400).json({ error: 'Missing required fields: fromRace, messageType, content' });
  }

  if (messageType !== 'public' && messageType !== 'secret') {
    return res.status(400).json({ error: 'messageType must be "public" or "secret"' });
  }

  try {
    console.log(`[RaceWorker] Received ${messageType} message from ${fromRace} to ${raceId}`);

    const agent = new RaceAgent(raceId);
    await agent.receiveMessage(fromRace, messageType, content, code);

    res.json({
      success: true,
      race: raceId,
      message: 'Message received and stored'
    });
  } catch (error) {
    console.error(`[RaceWorker] Error receiving message:`, error);
    res.status(500).json({
      success: false,
      race: raceId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// API: Get all messages for this race (for webui aggregation)
app.get('/api/messages', (req, res) => {
  const raceId = process.env.RACE_ID;

  if (!raceId) {
    return res.status(500).json({ error: 'RACE_ID environment variable not set' });
  }

  try {
    const db = getSpriteDb(raceId);

    const outgoing = db.prepare('SELECT * FROM outgoing_messages ORDER BY day_number ASC, created_at ASC').all();
    const incoming = db.prepare('SELECT * FROM incoming_messages ORDER BY day_number ASC, created_at ASC').all();

    res.json({
      raceId,
      outgoing,
      incoming
    });
  } catch (error) {
    console.error(`[RaceWorker] Error fetching messages:`, error);
    res.status(500).json({
      error: 'Failed to fetch messages',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// API: Get state for this race (current day, resources, etc.)
app.get('/api/state', (req, res) => {
  const raceId = process.env.RACE_ID;

  if (!raceId) {
    return res.status(500).json({ error: 'RACE_ID environment variable not set' });
  }

  try {
    const db = getSpriteDb(raceId);

    const currentDayRow = db.prepare('SELECT value FROM sprite_metadata WHERE key = ?').get('current_day') as { value: string } | undefined;
    const lastTurnAtRow = db.prepare('SELECT value FROM sprite_metadata WHERE key = ?').get('last_turn_at') as { value: string } | undefined;
    const resources = db.prepare('SELECT * FROM resources').all();

    res.json({
      raceId,
      currentDay: currentDayRow ? parseInt(currentDayRow.value, 10) : 0,
      lastTurnAt: lastTurnAtRow ? parseInt(lastTurnAtRow.value, 10) : 0,
      resources
    });
  } catch (error) {
    console.error(`[RaceWorker] Error fetching state:`, error);
    res.status(500).json({
      error: 'Failed to fetch state',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// API: Reset this race's state (clear all data, reset to day 0)
app.post('/api/reset', (req, res) => {
  const raceId = process.env.RACE_ID;

  if (!raceId) {
    return res.status(500).json({ error: 'RACE_ID environment variable not set' });
  }

  try {
    console.log(`[RaceWorker] Resetting state for ${raceId}`);
    const db = getSpriteDb(raceId);

    // Clear all tables
    db.prepare('DELETE FROM incoming_messages').run();
    db.prepare('DELETE FROM outgoing_messages').run();
    db.prepare('DELETE FROM action_log').run();
    db.prepare('DELETE FROM resources').run();

    // Reset metadata
    db.prepare('UPDATE sprite_metadata SET value = ? WHERE key = ?').run('0', 'current_day');
    db.prepare('UPDATE sprite_metadata SET value = ? WHERE key = ?').run('0', 'last_turn_at');

    // Re-initialize starting resources
    db.prepare('INSERT INTO resources (resource_type, amount) VALUES (?, ?)').run('energy', 100);
    db.prepare('INSERT INTO resources (resource_type, amount) VALUES (?, ?)').run('intelligence', 100);
    db.prepare('INSERT INTO resources (resource_type, amount) VALUES (?, ?)').run('influence', 100);

    console.log(`[RaceWorker] Reset complete for ${raceId}`);
    res.json({
      success: true,
      race: raceId,
      message: 'State reset successfully'
    });
  } catch (error) {
    console.error(`[RaceWorker] Error resetting state:`, error);
    res.status(500).json({
      success: false,
      race: raceId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(PORT, () => {
  const raceId = process.env.RACE_ID || 'UNKNOWN';
  console.log(`[RaceWorker] Race worker for ${raceId} listening on port ${PORT}`);
  console.log(`[RaceWorker] Ready to process turns at POST /take-turn`);
});
