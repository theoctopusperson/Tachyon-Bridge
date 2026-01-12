import { Pool } from 'pg';
import Database from 'better-sqlite3';
import { getDbClient, Message, SecretMessage, CycleState } from '../db/client';
import { getSpriteDb, ConversationHistoryRow, RelationshipRow, GoalRow } from '../db/sprite-client';
import { generateResponse } from '../llm/client';
import { getRaceById, RACES } from '../races';

interface LLMResponse {
  public_messages?: { to: string; content: string }[];
  secret_messages?: { to: string; content: string }[];
  relationship_updates?: { race: string; trust_delta: number; notes?: string }[];
  new_goals?: string[];
  new_secrets?: string[];
  personality_updates?: { key: string; value: number }[];
}

export class RaceAgent {
  private raceId: string;
  private pgDb: Pool;
  private spriteDb: Database.Database;

  constructor(raceId: string) {
    this.raceId = raceId;
    this.pgDb = getDbClient();
    this.spriteDb = getSpriteDb(raceId);

    // Initialize relationships for all other races if not exists
    this.initializeRelationships();
  }

  private initializeRelationships() {
    const otherRaces = RACES.filter(r => r.id !== this.raceId);

    for (const race of otherRaces) {
      const existing = this.spriteDb.prepare('SELECT * FROM relationships WHERE race_id = ?').get(race.id);
      if (!existing) {
        this.spriteDb.prepare(`
          INSERT INTO relationships (race_id, trust_level, is_ally, is_enemy, notes, last_updated_day)
          VALUES (?, 0, 0, 0, NULL, NULL)
        `).run(race.id);
      }
    }
  }

  async takeTurn(): Promise<void> {
    console.log(`[${this.raceId}] Taking turn...`);

    // 1. Get current day from PostgreSQL
    const currentDay = await this.getCurrentDay();
    console.log(`[${this.raceId}] Current day: ${currentDay}`);

    // 2. Check if we've already processed this day
    const lastProcessedDay = this.getLastProcessedDay();
    if (lastProcessedDay >= currentDay) {
      console.log(`[${this.raceId}] Already processed day ${currentDay}, skipping...`);
      return;
    }

    // 3. Fetch new messages from PostgreSQL
    const newPublicMessages = await this.fetchNewPublicMessages(currentDay);
    const newSecretMessages = await this.fetchNewSecretMessages(currentDay);

    console.log(`[${this.raceId}] Received ${newPublicMessages.length} public messages and ${newSecretMessages.length} secret messages`);

    // 4. Store messages in local conversation history
    this.storeIncomingMessages(newPublicMessages, newSecretMessages, currentDay);

    // 5. Build contextual LLM prompt
    const prompt = this.buildPrompt(newPublicMessages, newSecretMessages, currentDay);

    // 6. Generate response from LLM
    console.log(`[${this.raceId}] Generating response...`);
    const response = await this.generateRaceResponse(prompt);

    // 7. Process and save LLM response
    await this.processLLMResponse(response, currentDay);

    // 8. Update last processed day
    this.setLastProcessedDay(currentDay);

    console.log(`[${this.raceId}] Turn complete for day ${currentDay}`);
  }

  private async getCurrentDay(): Promise<number> {
    const result = await this.pgDb.query<CycleState>('SELECT current_day FROM cycle_state WHERE id = 1');
    return result.rows[0]?.current_day || 0;
  }

  private getLastProcessedDay(): number {
    const row = this.spriteDb.prepare('SELECT value FROM sprite_metadata WHERE key = ?').get('last_processed_day') as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : -1;
  }

  private setLastProcessedDay(day: number) {
    this.spriteDb.prepare('UPDATE sprite_metadata SET value = ? WHERE key = ?').run(day.toString(), 'last_processed_day');
  }

  private async fetchNewPublicMessages(currentDay: number): Promise<Message[]> {
    const result = await this.pgDb.query<Message>(
      'SELECT * FROM messages WHERE to_race = $1 AND day_number = $2 ORDER BY created_at ASC',
      [this.raceId, currentDay]
    );
    return result.rows;
  }

  private async fetchNewSecretMessages(currentDay: number): Promise<SecretMessage[]> {
    const result = await this.pgDb.query<SecretMessage>(
      'SELECT * FROM secret_messages WHERE to_race = $1 AND day_number = $2 ORDER BY created_at ASC',
      [this.raceId, currentDay]
    );
    return result.rows;
  }

  private storeIncomingMessages(publicMessages: Message[], secretMessages: SecretMessage[], dayNumber: number) {
    const timestamp = Date.now();

    for (const msg of publicMessages) {
      this.spriteDb.prepare(`
        INSERT INTO conversation_history (message_type, from_race, to_race, content, day_number, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('received_public', msg.from_race, msg.to_race, msg.content, dayNumber, timestamp);
    }

    for (const msg of secretMessages) {
      this.spriteDb.prepare(`
        INSERT INTO conversation_history (message_type, from_race, to_race, content, day_number, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('received_secret', msg.from_race, msg.to_race, msg.content, dayNumber, timestamp);
    }
  }

  private buildPrompt(publicMessages: Message[], secretMessages: SecretMessage[], currentDay: number): string {
    const race = getRaceById(this.raceId)!;

    // Get conversation history (last 20 messages)
    const history = this.spriteDb.prepare(`
      SELECT * FROM conversation_history
      ORDER BY day_number DESC, created_at DESC
      LIMIT 20
    `).all() as ConversationHistoryRow[];

    // Get relationships
    const relationships = this.spriteDb.prepare('SELECT * FROM relationships').all() as RelationshipRow[];

    // Get active goals
    const goals = this.spriteDb.prepare("SELECT * FROM goals WHERE status = 'active' ORDER BY priority DESC").all() as GoalRow[];

    // Format relationships for prompt
    const relationshipText = relationships
      .map(rel => {
        const trust = rel.trust_level > 0 ? `+${rel.trust_level}` : rel.trust_level.toString();
        const status = rel.is_ally ? ' [ALLY]' : rel.is_enemy ? ' [ENEMY]' : '';
        const notes = rel.notes ? ` - ${rel.notes}` : '';
        return `- ${rel.race_id}: Trust ${trust}${status}${notes}`;
      })
      .join('\n');

    // Format conversation history
    const historyText = history
      .reverse()
      .map(h => {
        const type = h.message_type === 'received_secret' ? '🔒 SECRET' : h.message_type === 'sent_secret' ? '🔒 SECRET' : '';
        const direction = h.message_type.startsWith('received') ? 'FROM' : 'TO';
        const otherRace = h.message_type.startsWith('received') ? h.from_race : h.to_race;
        return `Day ${h.day_number} ${type} ${direction} ${otherRace}: ${h.content}`;
      })
      .join('\n');

    // Format goals
    const goalsText = goals.length > 0 ? goals.map(g => `- ${g.description} (Priority: ${g.priority})`).join('\n') : 'No active goals';

    // Format incoming messages
    const publicMessagesText = publicMessages
      .map(m => `PUBLIC from ${m.from_race}: ${m.content}`)
      .join('\n\n');

    const secretMessagesText = secretMessages
      .map(m => `🔒 SECRET from ${m.from_race}: ${m.content}`)
      .join('\n\n');

    const incomingText = [publicMessagesText, secretMessagesText].filter(t => t).join('\n\n---\n\n');

    const otherRaces = RACES.filter(r => r.id !== this.raceId);
    const raceList = otherRaces.map(r => r.id).join(', ');

    // Build full prompt
    return `${race.culture}

${race.goals}

CURRENT DAY: ${currentDay}

YOUR RELATIONSHIPS:
${relationshipText}

YOUR ACTIVE GOALS:
${goalsText}

RECENT CONVERSATION HISTORY:
${historyText || 'No previous conversations'}

NEW MESSAGES THIS TURN:
${incomingText || 'No new messages this turn. Send initial broadcast to all races.'}

INSTRUCTIONS:
You must respond in JSON format with the following structure:
{
  "public_messages": [{"to": "race_id", "content": "your message"}],
  "secret_messages": [{"to": "race_id", "content": "your secret message"}],
  "relationship_updates": [{"race": "race_id", "trust_delta": number, "notes": "your private notes about this race"}],
  "new_goals": ["goal description"],
  "new_secrets": ["secret you want to keep"],
  "personality_updates": [{"key": "aggression", "value": 0.5}]
}

Available races: ${raceList}

- Use "public_messages" for communications all races can see
- Use "secret_messages" for private communications only the recipient can read
- Update relationships based on interactions (trust_delta can be positive or negative)
- Add new strategic goals or update existing ones
- Keep secrets that you don't want others to know about
- You can evolve your personality over time (keys: aggression, cooperation, trustworthiness)

Respond ONLY with valid JSON, no other text.`;
  }

  private async generateRaceResponse(prompt: string): Promise<LLMResponse> {
    const responseText = await generateResponse(prompt, [
      { role: 'user', content: 'Respond in JSON format as instructed.' }
    ]);

    console.log(`[${this.raceId}] Raw LLM response:`, responseText.substring(0, 200));

    try {
      const parsed = JSON.parse(responseText);
      return parsed as LLMResponse;
    } catch (error) {
      console.error(`[${this.raceId}] Failed to parse LLM response:`, responseText);
      throw error;
    }
  }

  private async processLLMResponse(response: LLMResponse, currentDay: number) {
    const timestamp = Date.now();
    const nextDay = currentDay + 1;

    // 1. Process public messages
    if (response.public_messages) {
      for (const msg of response.public_messages) {
        // Validate target race
        const targetRace = getRaceById(msg.to);
        if (!targetRace) {
          console.warn(`[${this.raceId}] Skipping public message to unknown race: ${msg.to}`);
          continue;
        }

        // Save to PostgreSQL
        await this.pgDb.query(
          'INSERT INTO messages (from_race, to_race, message_type, content, day_number) VALUES ($1, $2, $3, $4, $5)',
          [this.raceId, msg.to, 'public', msg.content, nextDay]
        );

        // Save to local history
        this.spriteDb.prepare(`
          INSERT INTO conversation_history (message_type, from_race, to_race, content, day_number, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('sent_public', this.raceId, msg.to, msg.content, nextDay, timestamp);

        console.log(`[${this.raceId}] PUBLIC -> ${msg.to}: ${msg.content.substring(0, 60)}...`);
      }
    }

    // 2. Process secret messages
    if (response.secret_messages) {
      for (const msg of response.secret_messages) {
        // Validate target race
        const targetRace = getRaceById(msg.to);
        if (!targetRace) {
          console.warn(`[${this.raceId}] Skipping secret message to unknown race: ${msg.to}`);
          continue;
        }

        // Save to PostgreSQL (secret_messages table)
        await this.pgDb.query(
          'INSERT INTO secret_messages (from_race, to_race, content, day_number) VALUES ($1, $2, $3, $4)',
          [this.raceId, msg.to, msg.content, nextDay]
        );

        // Save to local history
        this.spriteDb.prepare(`
          INSERT INTO conversation_history (message_type, from_race, to_race, content, day_number, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('sent_secret', this.raceId, msg.to, msg.content, nextDay, timestamp);

        console.log(`[${this.raceId}] 🔒 SECRET -> ${msg.to}: ${msg.content.substring(0, 60)}...`);
      }
    }

    // 3. Update relationships
    if (response.relationship_updates) {
      for (const update of response.relationship_updates) {
        this.spriteDb.prepare(`
          UPDATE relationships
          SET trust_level = trust_level + ?,
              notes = COALESCE(?, notes),
              last_updated_day = ?
          WHERE race_id = ?
        `).run(update.trust_delta, update.notes || null, currentDay, update.race);

        console.log(`[${this.raceId}] Updated relationship with ${update.race}: trust ${update.trust_delta > 0 ? '+' : ''}${update.trust_delta}`);
      }
    }

    // 4. Add new goals
    if (response.new_goals) {
      for (const goalDesc of response.new_goals) {
        this.spriteDb.prepare(`
          INSERT INTO goals (description, priority, status, created_day)
          VALUES (?, ?, ?, ?)
        `).run(goalDesc, 5, 'active', currentDay);

        console.log(`[${this.raceId}] New goal: ${goalDesc}`);
      }
    }

    // 5. Add new secrets
    if (response.new_secrets) {
      for (const secretContent of response.new_secrets) {
        this.spriteDb.prepare(`
          INSERT INTO secrets (content, created_day, revealed)
          VALUES (?, ?, 0)
        `).run(secretContent, currentDay);

        console.log(`[${this.raceId}] New secret recorded`);
      }
    }

    // 6. Update personality
    if (response.personality_updates) {
      for (const update of response.personality_updates) {
        this.spriteDb.prepare(`
          INSERT OR REPLACE INTO personality_state (key, value, last_updated_day)
          VALUES (?, ?, ?)
        `).run(update.key, update.value, currentDay);

        console.log(`[${this.raceId}] Personality update: ${update.key} = ${update.value}`);
      }
    }
  }
}
