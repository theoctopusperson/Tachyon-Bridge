import { Pool } from 'pg';

let pool: Pool | null = null;

export function getDbClient() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

export interface Race {
  id: string;
  name: string;
  culture: string;
  goals: string;
  region: string;
  created_at: Date;
}

export interface Message {
  id: number;
  from_race: string;
  to_race: string;
  content: string;
  day_number: number;
  created_at: Date;
}

export interface CycleState {
  id: number;
  current_day: number;
  last_run_at: Date | null;
}
