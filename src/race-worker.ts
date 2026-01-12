import 'dotenv/config';
import express from 'express';
import { RaceAgent } from './agent/race-agent';

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

app.listen(PORT, () => {
  const raceId = process.env.RACE_ID || 'UNKNOWN';
  console.log(`[RaceWorker] Race worker for ${raceId} listening on port ${PORT}`);
  console.log(`[RaceWorker] Ready to process turns at POST /take-turn`);
});
