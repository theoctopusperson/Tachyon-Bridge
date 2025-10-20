import 'dotenv/config';
import { getDbClient } from './db/client';
import { RACES } from './races';

async function seed() {
  console.log('Seeding database with alien races...');

  const db = getDbClient();

  try {
    // Insert all races
    for (const race of RACES) {
      await db.query(
        `INSERT INTO races (id, name, culture, goals, region)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET name = $2, culture = $3, goals = $4, region = $5`,
        [race.id, race.name, race.culture, race.goals, race.region]
      );
      console.log(`  ✓ Seeded race: ${race.name} (${race.region})`);
    }

    console.log('\nSeed completed successfully!');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

seed();
