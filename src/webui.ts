import 'dotenv/config';
import express from 'express';
import { join } from 'path';
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

interface OutgoingMessage {
  id: number;
  to_race: string;
  message_type: 'public' | 'secret';
  content: string;
  code: string | null;
  day_number: number;
  created_at: number;
}

interface IncomingMessage {
  id: number;
  from_race: string;
  message_type: 'public' | 'secret';
  content: string;
  code: string | null;
  day_number: number;
  executed: number;
  execution_result: string | null;
  created_at: number;
}

interface RaceSpriteMessages {
  raceId: string;
  outgoing: OutgoingMessage[];
  incoming: IncomingMessage[];
}

interface Resource {
  resource_type: string;
  amount: number;
}

interface RaceSpriteState {
  raceId: string;
  currentDay: number;
  resources: Resource[];
  lastTurnAt: number;
}

// API: Get all messages (aggregate from all race sprites)
app.get('/api/messages', async (req, res) => {
  try {
    console.log('[WebUI] Fetching messages from all race sprites...');

    const raceIds = Object.keys(SPRITE_URLS);
    const results = await Promise.allSettled(
      raceIds.map(async (raceId) => {
        const url = `${SPRITE_URLS[raceId]}/api/messages`;
        console.log(`[WebUI] Fetching from ${url}...`);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`${raceId} failed: ${response.statusText}`);
        }

        const data = await response.json() as RaceSpriteMessages;
        return data;
      })
    );

    // Combine all messages from all races
    const allMessages: any[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const raceId = raceIds[i];

      if (result.status === 'fulfilled') {
        const { outgoing, incoming } = result.value;

        // Add outgoing messages (messages this race sent)
        for (const msg of outgoing) {
          allMessages.push({
            id: `${raceId}-out-${msg.id}`,
            from_race: raceId,
            to_race: msg.to_race,
            message_type: msg.message_type,
            content: msg.content,
            code: msg.code,
            day_number: msg.day_number,
            created_at: new Date(msg.created_at).toISOString(),
            category: msg.message_type,
            from_name: RACES.find(r => r.id === raceId)?.name || raceId,
            to_name: RACES.find(r => r.id === msg.to_race)?.name || msg.to_race,
          });
        }

        // Note: We don't need to add incoming messages because they're duplicates
        // of outgoing messages from other races
      } else {
        console.error(`[WebUI] Failed to fetch messages from ${raceId}:`, result.reason);
      }
    }

    // Sort by day number and timestamp
    allMessages.sort((a, b) => {
      if (a.day_number !== b.day_number) {
        return a.day_number - b.day_number;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    res.json(allMessages);
  } catch (error) {
    console.error('[WebUI] Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// API: Get all races
app.get('/api/races', async (req, res) => {
  try {
    // Return race data from RACES constant
    const racesWithState = await Promise.all(
      RACES.map(async (race) => {
        try {
          const url = `${SPRITE_URLS[race.id]}/api/state`;
          const response = await fetch(url);

          if (!response.ok) {
            return {
              ...race,
              currentDay: 0,
              resources: [],
              lastTurnAt: 0,
            };
          }

          const state = await response.json() as RaceSpriteState;
          return {
            ...race,
            currentDay: state.currentDay,
            resources: state.resources,
            lastTurnAt: state.lastTurnAt,
          };
        } catch (error) {
          console.error(`[WebUI] Failed to fetch state for ${race.id}:`, error);
          return {
            ...race,
            currentDay: 0,
            resources: [],
            lastTurnAt: 0,
          };
        }
      })
    );

    res.json(racesWithState);
  } catch (error) {
    console.error('[WebUI] Error fetching races:', error);
    res.status(500).json({ error: 'Failed to fetch races' });
  }
});

// API: Get current cycle state (aggregate from all sprites)
app.get('/api/cycle', async (req, res) => {
  try {
    const raceIds = Object.keys(SPRITE_URLS);
    const results = await Promise.allSettled(
      raceIds.map(async (raceId) => {
        const url = `${SPRITE_URLS[raceId]}/api/state`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`${raceId} failed: ${response.statusText}`);
        }

        const data = await response.json() as RaceSpriteState;
        return data.currentDay;
      })
    );

    // Get the maximum day number across all sprites
    let maxDay = 0;
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value > maxDay) {
        maxDay = result.value;
      }
    }

    res.json({ current_day: maxDay });
  } catch (error) {
    console.error('[WebUI] Error fetching cycle state:', error);
    res.status(500).json({ error: 'Failed to fetch cycle state' });
  }
});

// API: Get events (no longer stored in central DB - would need to aggregate from action logs)
app.get('/api/events', async (req, res) => {
  try {
    // For now, return empty array - events would need to be aggregated from action_log tables
    res.json([]);
  } catch (error) {
    console.error('[WebUI] Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
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
    console.error('[WebUI] Error triggering all cycles:', error);
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
