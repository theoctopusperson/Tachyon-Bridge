// Type definitions for database entities
// These are kept for backwards compatibility but are no longer used
// in the new pure-SQLite architecture

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
  message_type?: string;
  content: string;
  code?: string | null;
  day_number: number;
  created_at: Date;
}

export interface SecretMessage {
  id: number;
  from_race: string;
  to_race: string;
  content: string;
  code?: string | null;
  day_number: number;
  created_at: Date;
}

export interface Treaty {
  id: number;
  race_a: string;
  race_b: string;
  treaty_type: string;
  status: 'active' | 'broken' | 'expired';
  terms: string | null;
  created_day: number;
  broken_day: number | null;
  created_at: Date;
}

export interface War {
  id: number;
  aggressor: string;
  defender: string;
  status: 'ongoing' | 'ended';
  declaration: string | null;
  started_day: number;
  ended_day: number | null;
  created_at: Date;
}

export interface Event {
  id: number;
  event_type: string;
  involved_races: string[];
  description: string;
  day_number: number;
  created_at: Date;
}

export interface CycleState {
  id: number;
  current_day: number;
  last_run_at: Date | null;
}

export interface ActionLog {
  id: number;
  day_number: number;
  actor_race: string | null;
  target_race: string | null;
  action_type: string;
  details: any; // JSONB
  created_at: Date;
}
