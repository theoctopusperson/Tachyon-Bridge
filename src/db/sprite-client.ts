import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

// Map of race ID to database connection (supports multi-race per sprite)
const dbConnections: Map<string, Database.Database> = new Map();

export function getSpriteDb(raceId: string): Database.Database {
  let db = dbConnections.get(raceId);

  if (!db) {
    // SQLite database file location (persistent across sprite wake/sleep)
    const dbPath = `./data/${raceId}-state.db`;

    db = new Database(dbPath);

    // Initialize schema if needed
    const schemaPath = join(__dirname, 'sprite-schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    dbConnections.set(raceId, db);
    console.log(`[SpriteDB] Initialized SQLite database for ${raceId} at ${dbPath}`);
  }

  return db;
}

export function closeSpriteDb(raceId?: string) {
  if (raceId) {
    const db = dbConnections.get(raceId);
    if (db) {
      db.close();
      dbConnections.delete(raceId);
    }
  } else {
    // Close all connections
    for (const [id, db] of dbConnections) {
      db.close();
      dbConnections.delete(id);
    }
  }
}

// TypeScript interfaces for SQLite tables

export interface OutgoingMessageRow {
  id: number;
  to_race: string;
  message_type: 'public' | 'secret';
  content: string;
  code: string | null;
  day_number: number;
  created_at: number;
}

export interface IncomingMessageRow {
  id: number;
  from_race: string;
  message_type: 'public' | 'secret';
  content: string;
  code: string | null;
  day_number: number;
  executed: number; // 0 or 1 (boolean)
  execution_result: string | null;
  created_at: number;
}

export interface RelationshipRow {
  race_id: string;
  trust_level: number;
  is_ally: number; // 0 or 1 (boolean)
  is_enemy: number; // 0 or 1 (boolean)
  notes: string | null;
  last_updated_day: number | null;
}

export interface GoalRow {
  id: number;
  description: string;
  priority: number;
  status: 'active' | 'completed' | 'abandoned';
  created_day: number;
  completed_day: number | null;
}

export interface SecretRow {
  id: number;
  content: string;
  created_day: number;
  revealed: number; // 0 or 1 (boolean)
}

export interface PersonalityStateRow {
  key: string;
  value: number;
  last_updated_day: number | null;
}

export interface SpriteMetadataRow {
  key: string;
  value: string;
}

export interface ResourceRow {
  resource_type: string;
  amount: number;
}

export interface StolenSecretRow {
  id: number;
  about_race: string;
  secret_data: string;
  stolen_at: number;
}

export interface ActionLogRow {
  id: number;
  day_number: number;
  action_type: string;
  actor_race: string | null;
  details: string | null; // JSON string
  created_at: number;
}
