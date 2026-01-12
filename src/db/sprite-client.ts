import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

let db: Database.Database | null = null;

export function getSpriteDb(raceId: string): Database.Database {
  if (!db) {
    // SQLite database file location (persistent across sprite wake/sleep)
    const dbPath = process.env.SPRITE_DB_PATH || `./data/${raceId}-state.db`;

    db = new Database(dbPath);

    // Initialize schema if needed
    const schemaPath = join(__dirname, 'sprite-schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    console.log(`[SpriteDB] Initialized SQLite database at ${dbPath}`);
  }

  return db;
}

export function closeSpriteDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// TypeScript interfaces for SQLite tables

export interface ConversationHistoryRow {
  id: number;
  message_type: 'received_public' | 'received_secret' | 'sent_public' | 'sent_secret';
  from_race: string;
  to_race: string;
  content: string;
  day_number: number;
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
