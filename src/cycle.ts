import 'dotenv/config';
import { getDbClient, Message, Race, CycleState } from './db/client';
import { generateResponse } from './llm/client';
import { buildSystemPrompt, buildUserPrompt } from './llm/prompts';
import { getRaceById, RACES } from './races';

// Map Fly.io regions to race IDs
const REGION_TO_RACE: Record<string, string> = {
  'lax': 'zephyrians',
  'fra': 'kromath',
  'syd': 'valyrians',
  'gru': 'mycelings',
  'sin': 'synthetics',
};

async function runCycleForRace(raceId: string) {
  const race = getRaceById(raceId);
  if (!race) {
    throw new Error(`Unknown race: ${raceId}`);
  }

  console.log(`[${race.name}] Starting communication cycle in region ${race.region}...`);

  const db = getDbClient();

  // Get current day
  const cycleResult = await db.query<CycleState>('SELECT current_day FROM cycle_state WHERE id = 1');
  const currentDay = cycleResult.rows[0]?.current_day || 0;

  console.log(`[${race.name}] Day ${currentDay}`);

  // Get messages addressed to this race from the current day
  const messagesResult = await db.query<Message>(
    'SELECT * FROM messages WHERE to_race = $1 AND day_number = $2 ORDER BY created_at ASC',
    [raceId, currentDay]
  );

  const incomingMessages = messagesResult.rows;
  console.log(`[${race.name}] Received ${incomingMessages.length} messages`);

  // Build prompt
  const allRaces = RACES.map(r => ({ ...r, created_at: new Date() }));
  const systemPrompt = buildSystemPrompt({ ...race, created_at: new Date() }, currentDay, allRaces);
  const userPrompt = buildUserPrompt(incomingMessages, allRaces, raceId);

  // Generate responses
  console.log(`[${race.name}] Generating responses...`);
  let responseText: string;
  try {
    responseText = await generateResponse(systemPrompt, [
      { role: 'user', content: userPrompt }
    ]);
    console.log(`[${race.name}] Received response from Claude:`, responseText.substring(0, 100) + '...');
  } catch (error) {
    console.error(`[${race.name}] Failed to call Claude API:`, error);
    throw error;
  }

  // Parse responses
  let responses: { to: string; message: string }[];
  try {
    responses = JSON.parse(responseText);
    if (!Array.isArray(responses)) {
      throw new Error('Response is not an array');
    }
  } catch (error) {
    console.error(`[${race.name}] Failed to parse LLM response:`, responseText);
    throw error;
  }

  // Insert messages into database
  const nextDay = currentDay + 1;
  for (const response of responses) {
    // Validate target race exists
    const targetRace = getRaceById(response.to);
    if (!targetRace) {
      console.warn(`[${race.name}] Skipping message to unknown race: ${response.to}`);
      continue;
    }

    await db.query(
      'INSERT INTO messages (from_race, to_race, content, day_number) VALUES ($1, $2, $3, $4)',
      [raceId, response.to, response.message, nextDay]
    );

    console.log(`[${race.name}] -> ${targetRace.name}: ${response.message.substring(0, 60)}...`);
  }

  console.log(`[${race.name}] Cycle complete. Sent ${responses.length} messages for Day ${nextDay}`);
}

async function runCycle() {
  // Get race ID from env var (allows override) or auto-detect from region
  let raceId = process.env.RACE_ID;

  if (!raceId) {
    const flyRegion = process.env.FLY_REGION;
    if (flyRegion) {
      raceId = REGION_TO_RACE[flyRegion];
      console.log(`Auto-detected region ${flyRegion} -> race ${raceId}`);
    }
  }

  if (!raceId) {
    throw new Error('RACE_ID not set and could not auto-detect from FLY_REGION');
  }

  await runCycleForRace(raceId);
}

// Export for use as API endpoint or standalone script
export { runCycle, runCycleForRace };

// If run directly as a script (not imported), execute immediately
if (require.main === module) {
  runCycle()
    .then(() => {
      console.log('Cycle completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Cycle failed:', error);
      process.exit(1);
    });
}
