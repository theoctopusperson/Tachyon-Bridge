import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { RaceAgent } from './agent/race-agent';
import { getSpriteDb } from './db/sprite-client';
import { RACES } from './races';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Determine which races this worker handles
// RACE_IDS (comma-separated) takes priority, falls back to RACE_ID (single)
const configuredRaceIds = process.env.RACE_IDS
  ? process.env.RACE_IDS.split(',').map(id => id.trim())
  : process.env.RACE_ID
    ? [process.env.RACE_ID]
    : [];

// Validate race IDs against known races
const validRaceIds = configuredRaceIds.filter(id => RACES.some(r => r.id === id));

if (validRaceIds.length === 0) {
  console.error('[RaceWorker] No valid race IDs configured. Set RACE_ID or RACE_IDS env var.');
  process.exit(1);
}

console.log(`[RaceWorker] Configured to handle races: ${validRaceIds.join(', ')}`);

// Middleware to extract and validate race ID from path
function extractRaceId(req: Request, res: Response, next: NextFunction) {
  const raceId = req.params.raceId;

  if (!raceId) {
    return res.status(400).json({ error: 'Race ID required in path' });
  }

  if (!validRaceIds.includes(raceId)) {
    return res.status(404).json({ error: `Race ${raceId} not handled by this worker` });
  }

  // Attach raceId to request for use in handlers
  (req as any).raceId = raceId;
  next();
}

// Health check endpoint (no race ID required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', role: 'race-worker', races: validRaceIds });
});

// All race-specific endpoints use /:raceId prefix
const raceRouter = express.Router({ mergeParams: true });

// Main endpoint for race sprites - executes one turn
raceRouter.post('/take-turn', async (req, res) => {
  const raceId = (req as any).raceId;

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
    console.error(`[RaceWorker] Error during turn for ${raceId}:`, error);
    res.status(500).json({
      success: false,
      race: raceId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Endpoint for receiving messages from other race sprites
raceRouter.post('/receive-message', async (req, res) => {
  const raceId = (req as any).raceId;
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
    console.error(`[RaceWorker] Error receiving message for ${raceId}:`, error);
    res.status(500).json({
      success: false,
      race: raceId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// API: Get all messages for this race (for webui aggregation)
raceRouter.get('/api/messages', (req, res) => {
  const raceId = (req as any).raceId;

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
    console.error(`[RaceWorker] Error fetching messages for ${raceId}:`, error);
    res.status(500).json({
      error: 'Failed to fetch messages',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// API: Get state for this race (current day, resources, etc.)
raceRouter.get('/api/state', (req, res) => {
  const raceId = (req as any).raceId;

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
    console.error(`[RaceWorker] Error fetching state for ${raceId}:`, error);
    res.status(500).json({
      error: 'Failed to fetch state',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// API: Get this race's trust levels toward other races
// Used by webui to calculate each race's reputation (average of how much others trust them)
raceRouter.get('/api/trust', (req, res) => {
  const raceId = (req as any).raceId;

  try {
    const db = getSpriteDb(raceId);

    // Get all relationships (trust levels this race has toward others)
    const relationships = db.prepare(`
      SELECT race_id, trust_level, is_ally, is_enemy, notes, last_updated_day
      FROM relationships
    `).all();

    res.json({
      raceId,
      trustLevels: relationships
    });
  } catch (error) {
    console.error(`[RaceWorker] Error fetching trust levels for ${raceId}:`, error);
    res.status(500).json({
      error: 'Failed to fetch trust levels',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// API: Reset this race's state (clear all data, reset to day 0)
raceRouter.post('/api/reset', (req, res) => {
  const raceId = (req as any).raceId;

  try {
    console.log(`[RaceWorker] Resetting state for ${raceId}`);
    const db = getSpriteDb(raceId);

    // Clear all tables
    db.prepare('DELETE FROM incoming_messages').run();
    db.prepare('DELETE FROM outgoing_messages').run();
    db.prepare('DELETE FROM action_log').run();
    db.prepare('DELETE FROM resources').run();
    db.prepare('DELETE FROM relationships').run();

    // Reset metadata
    db.prepare('UPDATE sprite_metadata SET value = ? WHERE key = ?').run('0', 'current_day');
    db.prepare('UPDATE sprite_metadata SET value = ? WHERE key = ?').run('0', 'last_turn_at');

    // Re-initialize starting resources (matching sprite-schema.sql)
    // Note: Reputation is calculated from other races' trust levels, not stored here
    db.prepare('INSERT INTO resources (resource_type, amount) VALUES (?, ?)').run('energy', 10000);
    db.prepare('INSERT INTO resources (resource_type, amount) VALUES (?, ?)').run('intelligence', 0);

    console.log(`[RaceWorker] Reset complete for ${raceId}`);
    res.json({
      success: true,
      race: raceId,
      message: 'State reset successfully'
    });
  } catch (error) {
    console.error(`[RaceWorker] Error resetting state for ${raceId}:`, error);
    res.status(500).json({
      success: false,
      race: raceId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Mount race router with race ID parameter
app.use('/:raceId', extractRaceId, raceRouter);

app.listen(PORT, () => {
  console.log(`[RaceWorker] Multi-race worker listening on port ${PORT}`);
  console.log(`[RaceWorker] Handling races: ${validRaceIds.join(', ')}`);
  console.log(`[RaceWorker] Endpoints available at /:raceId/take-turn, /:raceId/api/messages, etc.`);
});
