import 'dotenv/config';
import express from 'express';
import { join } from 'path';
import { getDbClient, Message, SecretMessage, Event } from './db/client';
import { RACES } from './races';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Serve static files
app.use(express.static(join(__dirname, '..', 'src', 'web', 'public')));

// Get sprite URLs from environment variables
const SPRITE_URLS: Record<string, string> = {
  zephyrians: process.env.SPRITE_URL_ZEPHYRIANS || 'http://localhost:3001',
  kromath: process.env.SPRITE_URL_KROMATH || 'http://localhost:3002',
  valyrians: process.env.SPRITE_URL_VALYRIANS || 'http://localhost:3003',
  mycelings: process.env.SPRITE_URL_MYCELINGS || 'http://localhost:3004',
  synthetics: process.env.SPRITE_URL_SYNTHETICS || 'http://localhost:3005',
};

// API: Get all messages (both public and secret - UI can see all)
app.get('/api/messages', async (req, res) => {
  try {
    const db = getDbClient();

    // Get public messages
    const publicResult = await db.query<Message>(
      `SELECT m.*,
        r1.name as from_name,
        r2.name as to_name,
        'public' as message_category
       FROM messages m
       JOIN races r1 ON m.from_race = r1.id
       JOIN races r2 ON m.to_race = r2.id
       ORDER BY m.day_number ASC, m.created_at ASC`
    );

    // Get secret messages
    const secretResult = await db.query<SecretMessage>(
      `SELECT s.*,
        r1.name as from_name,
        r2.name as to_name,
        'secret' as message_category
       FROM secret_messages s
       JOIN races r1 ON s.from_race = r1.id
       JOIN races r2 ON s.to_race = r2.id
       ORDER BY s.day_number ASC, s.created_at ASC`
    );

    // Combine and sort by day/timestamp
    const allMessages = [
      ...publicResult.rows.map(m => ({ ...m, category: 'public' })),
      ...secretResult.rows.map(m => ({ ...m, category: 'secret' }))
    ].sort((a, b) => {
      if (a.day_number !== b.day_number) {
        return a.day_number - b.day_number;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    res.json(allMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// API: Get all races
app.get('/api/races', async (req, res) => {
  try {
    const db = getDbClient();
    const result = await db.query('SELECT * FROM races ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching races:', error);
    res.status(500).json({ error: 'Failed to fetch races' });
  }
});

// API: Get current cycle state
app.get('/api/cycle', async (req, res) => {
  try {
    const db = getDbClient();
    const result = await db.query('SELECT * FROM cycle_state WHERE id = 1');
    res.json(result.rows[0] || { current_day: 0 });
  } catch (error) {
    console.error('Error fetching cycle state:', error);
    res.status(500).json({ error: 'Failed to fetch cycle state' });
  }
});

// API: Get events
app.get('/api/events', async (req, res) => {
  try {
    const db = getDbClient();
    const result = await db.query<Event>('SELECT * FROM events ORDER BY day_number DESC, created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// API: Advance to next day
app.post('/api/cycle/advance', async (req, res) => {
  try {
    const db = getDbClient();
    await db.query('UPDATE cycle_state SET current_day = current_day + 1, last_run_at = NOW() WHERE id = 1');
    const result = await db.query('SELECT * FROM cycle_state WHERE id = 1');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error advancing cycle:', error);
    res.status(500).json({ error: 'Failed to advance cycle' });
  }
});

// API: Trigger all race sprites to run their turns
app.post('/api/cycle/run-all', async (req, res) => {
  try {
    console.log('[WebUI] Triggering all race sprites...');

    const raceIds = Object.keys(SPRITE_URLS);
    const spritesToken = process.env.SPRITES_TOKEN;

    const results = await Promise.allSettled(
      raceIds.map(async (raceId) => {
        const url = `${SPRITE_URLS[raceId]}/take-turn`;

        console.log(`[WebUI] Calling ${raceId} at ${url}...`);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Add auth token if available (for production sprites)
        if (spritesToken) {
          headers['Authorization'] = `Bearer ${spritesToken}`;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
        });

        if (!response.ok) {
          throw new Error(`${raceId} failed: ${response.statusText}`);
        }

        const data = await response.json();
        return { raceId, success: true, data };
      })
    );

    const summary = results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return {
          raceId: raceIds[i],
          status: result.status,
          success: result.value.success,
          data: result.value.data
        };
      } else {
        return {
          raceId: raceIds[i],
          status: result.status,
          error: result.reason.message
        };
      }
    });

    const successCount = results.filter(r => r.status === 'fulfilled').length;

    res.json({
      success: successCount === raceIds.length,
      triggered: successCount,
      total: raceIds.length,
      results: summary,
    });
  } catch (error) {
    console.error('Error triggering all cycles:', error);
    res.status(500).json({
      error: 'Failed to trigger all cycles',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '..', 'src', 'web', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[WebUI] TachyonBridge web interface running on port ${PORT}`);
  console.log(`[WebUI] Configured sprite URLs:`, SPRITE_URLS);
});
