import 'dotenv/config';
import express from 'express';
import { join } from 'path';
import { getDbClient, Message } from './db/client';
import { RACES } from './races';

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(join(__dirname, '..', 'src', 'web', 'public')));

// API: Get all messages
app.get('/api/messages', async (req, res) => {
  try {
    const db = getDbClient();
    const result = await db.query<Message>(
      `SELECT m.*,
        r1.name as from_name,
        r2.name as to_name
       FROM messages m
       JOIN races r1 ON m.from_race = r1.id
       JOIN races r2 ON m.to_race = r2.id
       ORDER BY m.day_number ASC, m.created_at ASC`
    );
    res.json(result.rows);
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

// API: Advance to next day (for testing)
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

// API: Run communication cycle for this machine's race
app.post('/api/cycle/run', async (req, res) => {
  try {
    // Import and run the cycle
    const { runCycle } = await import('./cycle');
    await runCycle();
    res.json({ success: true, message: 'Cycle completed successfully' });
  } catch (error) {
    console.error('Error running cycle:', error);
    res.status(500).json({ error: 'Failed to run cycle', details: error instanceof Error ? error.message : String(error) });
  }
});

// API: Trigger all regional machines to run their cycles
app.post('/api/cycle/run-all', async (req, res) => {
  try {
    const isProduction = process.env.FLY_APP_NAME !== undefined;
    const regions = ['lax', 'fra', 'syd', 'gru', 'sin'];

    console.log(`Triggering cycle for all regions: ${regions.join(', ')}`);

    if (isProduction) {
      // PRODUCTION: Make HTTP requests to regional machines via Fly's proxy
      const appName = process.env.FLY_APP_NAME || 'tachyonbridge';
      const results = await Promise.allSettled(
        regions.map(async (region) => {
          const url = `https://${appName}.fly.dev/api/cycle/run`;
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Fly-Prefer-Region': region, // Hint to route to specific region
          };

          console.log(`Triggering cycle for region ${region}...`);

          const response = await fetch(url, {
            method: 'POST',
            headers,
          });

          if (!response.ok) {
            throw new Error(`Region ${region} failed: ${response.statusText}`);
          }

          const data = await response.json();
          return { region, success: true, data };
        })
      );

      const summary = results.map((result, i) => {
        if (result.status === 'fulfilled') {
          return {
            region: regions[i],
            status: result.status,
            success: result.value.success,
            data: result.value.data
          };
        } else {
          return { region: regions[i], status: result.status, error: result.reason.message };
        }
      });

      const successCount = results.filter(r => r.status === 'fulfilled').length;

      res.json({
        success: successCount === regions.length,
        triggered: successCount,
        total: regions.length,
        results: summary,
      });
    } else {
      // LOCAL: Run all race cycles sequentially in same process
      console.log('Running in local mode - simulating all races on this machine');

      const { runCycleForRace } = await import('./cycle');
      const raceIds = ['zephyrians', 'kromath', 'valyrians', 'mycelings', 'synthetics'];

      const results = await Promise.allSettled(
        raceIds.map(async (raceId) => {
          console.log(`Running cycle for ${raceId}...`);
          await runCycleForRace(raceId);
          return { raceId, success: true };
        })
      );

      const summary = results.map((result, i) => {
        if (result.status === 'fulfilled') {
          return {
            region: regions[i],
            raceId: raceIds[i],
            status: result.status,
            success: result.value.success
          };
        } else {
          return { region: regions[i], raceId: raceIds[i], status: result.status, error: result.reason.message };
        }
      });

      const successCount = results.filter(r => r.status === 'fulfilled').length;

      res.json({
        success: successCount === raceIds.length,
        triggered: successCount,
        total: raceIds.length,
        results: summary,
        note: 'Running in local mode - all races executed on same machine',
      });
    }
  } catch (error) {
    console.error('Error triggering all cycles:', error);
    res.status(500).json({ error: 'Failed to trigger all cycles', details: error instanceof Error ? error.message : String(error) });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '..', 'src', 'web', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TachyonBridge web interface running on port ${PORT}`);
});
