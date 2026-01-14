#!/usr/bin/env node
import 'dotenv/config';

// Entry point router based on SPRITE_ROLE environment variable
const spriteRole = process.env.SPRITE_ROLE;

if (!spriteRole) {
  console.error('ERROR: SPRITE_ROLE environment variable is required');
  console.error('Valid values: "webui" or "race"');
  process.exit(1);
}

console.log(`[Main] Starting TachyonBridge with SPRITE_ROLE=${spriteRole}`);

if (spriteRole === 'webui') {
  // Start web UI server (orchestrator)
  console.log('[Main] Loading Web UI server...');
  require('./webui');
} else if (spriteRole === 'race') {
  // Start race worker server
  // Supports both RACE_ID (single race) and RACE_IDS (comma-separated multiple races)
  const raceId = process.env.RACE_ID;
  const raceIds = process.env.RACE_IDS;
  if (!raceId && !raceIds) {
    console.error('ERROR: RACE_ID or RACE_IDS environment variable is required for race workers');
    console.error('RACE_ID: single race (e.g., "zephyrians")');
    console.error('RACE_IDS: comma-separated (e.g., "zephyrians,valyrians")');
    process.exit(1);
  }
  const races = raceIds || raceId;
  console.log(`[Main] Loading Race Worker for: ${races}...`);
  require('./race-worker');
} else {
  console.error(`ERROR: Invalid SPRITE_ROLE: ${spriteRole}`);
  console.error('Valid values: "webui" or "race"');
  process.exit(1);
}
