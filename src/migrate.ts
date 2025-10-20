import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getDbClient } from './db/client';

async function migrate() {
  console.log('Running database migration...');

  const client = getDbClient();
  const schema = readFileSync(join(__dirname, 'db', 'schema.sql'), 'utf-8');

  try {
    await client.query(schema);
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
