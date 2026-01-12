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
  const raceId = process.env.RACE_ID;
  if (!raceId) {
    console.error('ERROR: RACE_ID environment variable is required for race workers');
    console.error('Valid values: zephyrians, kromath, valyrians, mycelings, synthetics');
    process.exit(1);
  }
  console.log(`[Main] Loading Race Worker for ${raceId}...`);
  require('./race-worker');
} else {
  console.error(`ERROR: Invalid SPRITE_ROLE: ${spriteRole}`);
  console.error('Valid values: "webui" or "race"');
  process.exit(1);
}
