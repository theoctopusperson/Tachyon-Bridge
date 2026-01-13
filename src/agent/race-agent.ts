import Database from 'better-sqlite3';
import { getSpriteDb, OutgoingMessageRow, IncomingMessageRow, RelationshipRow, GoalRow, ResourceRow } from '../db/sprite-client';
import { generateResponse } from '../llm/client';
import { getRaceById, RACES } from '../races';

interface LLMResponse {
  public_messages?: { to: string; content: string; code?: string }[];
  secret_messages?: { to: string; content: string; code?: string }[];
  relationship_updates?: { race: string; trust_delta: number; notes?: string }[];
  new_goals?: string[];
  new_secrets?: string[];
  personality_updates?: { key: string; value: number }[];
  code_execution_decisions?: { message_id: number; execute: boolean; reason: string }[];
  resource_actions?: { action: 'steal' | 'gift'; target_race: string; resource_type: string; amount: number }[];
}

// Get sprite URLs from environment
const SPRITE_URLS: Record<string, string> = {
  zephyrians: process.env.SPRITE_URL_ZEPHYRIANS || 'http://localhost:3001',
  kromath: process.env.SPRITE_URL_KROMATH || 'http://localhost:3002',
  valyrians: process.env.SPRITE_URL_VALYRIANS || 'http://localhost:3003',
  mycelings: process.env.SPRITE_URL_MYCELINGS || 'http://localhost:3004',
  synthetics: process.env.SPRITE_URL_SYNTHETICS || 'http://localhost:3005',
};

export class RaceAgent {
  private raceId: string;
  private spriteDb: Database.Database;

  constructor(raceId: string) {
    this.raceId = raceId;
    this.spriteDb = getSpriteDb(raceId);

    // Initialize race_id in metadata if not set
    const raceIdMeta = this.spriteDb.prepare('SELECT value FROM sprite_metadata WHERE key = ?').get('race_id') as { value: string } | undefined;
    if (!raceIdMeta || raceIdMeta.value === '') {
      this.spriteDb.prepare('UPDATE sprite_metadata SET value = ? WHERE key = ?').run(raceId, 'race_id');
    }

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

  // Called when another race sends us a message via HTTP POST
  async receiveMessage(fromRace: string, messageType: 'public' | 'secret', content: string, code?: string): Promise<void> {
    const currentDay = this.getCurrentDay();
    const timestamp = Date.now();

    console.log(`[${this.raceId}] Received ${messageType} message from ${fromRace}`);

    this.spriteDb.prepare(`
      INSERT INTO incoming_messages (from_race, message_type, content, code, day_number, executed, execution_result, created_at)
      VALUES (?, ?, ?, ?, ?, 0, NULL, ?)
    `).run(fromRace, messageType, content, code || null, currentDay, timestamp);
  }

  async takeTurn(): Promise<void> {
    console.log(`[${this.raceId}] Taking turn...`);

    const currentDay = this.getCurrentDay();
    console.log(`[${this.raceId}] Current day: ${currentDay}`);

    // Get unprocessed messages (messages with code that haven't been executed yet)
    const unexecutedMessages = this.spriteDb.prepare(`
      SELECT * FROM incoming_messages
      WHERE code IS NOT NULL AND executed = 0
      ORDER BY day_number ASC, created_at ASC
    `).all() as IncomingMessageRow[];

    // Get all messages from current day for context
    const todaysMessages = this.spriteDb.prepare(`
      SELECT * FROM incoming_messages
      WHERE day_number = ?
      ORDER BY created_at ASC
    `).all(currentDay) as IncomingMessageRow[];

    console.log(`[${this.raceId}] Found ${todaysMessages.length} messages for today, ${unexecutedMessages.length} with unexecuted code`);

    // Build contextual LLM prompt
    const prompt = this.buildPrompt(todaysMessages, unexecutedMessages, currentDay);

    // Generate response from LLM
    console.log(`[${this.raceId}] Generating response...`);
    const response = await this.generateRaceResponse(prompt);

    // Process and save LLM response
    await this.processLLMResponse(response, currentDay);

    // Increment day counter
    this.incrementDay();

    console.log(`[${this.raceId}] Turn complete for day ${currentDay}`);
  }

  private getCurrentDay(): number {
    const row = this.spriteDb.prepare('SELECT value FROM sprite_metadata WHERE key = ?').get('current_day') as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 0;
  }

  private incrementDay() {
    const currentDay = this.getCurrentDay();
    const newDay = currentDay + 1;
    const timestamp = Date.now();

    this.spriteDb.prepare('UPDATE sprite_metadata SET value = ? WHERE key = ?').run(newDay.toString(), 'current_day');
    this.spriteDb.prepare('UPDATE sprite_metadata SET value = ? WHERE key = ?').run(timestamp.toString(), 'last_turn_at');
  }

  private buildPrompt(todaysMessages: IncomingMessageRow[], unexecutedMessages: IncomingMessageRow[], currentDay: number): string {
    const race = getRaceById(this.raceId)!;

    // Get recent outgoing messages (last 10)
    const outgoingHistory = this.spriteDb.prepare(`
      SELECT * FROM outgoing_messages
      ORDER BY day_number DESC, created_at DESC
      LIMIT 10
    `).all() as OutgoingMessageRow[];

    // Get recent incoming messages (last 10)
    const incomingHistory = this.spriteDb.prepare(`
      SELECT * FROM incoming_messages
      ORDER BY day_number DESC, created_at DESC
      LIMIT 10
    `).all() as IncomingMessageRow[];

    // Get relationships
    const relationships = this.spriteDb.prepare('SELECT * FROM relationships').all() as RelationshipRow[];

    // Get active goals
    const goals = this.spriteDb.prepare("SELECT * FROM goals WHERE status = 'active' ORDER BY priority DESC").all() as GoalRow[];

    // Get resources
    const resources = this.spriteDb.prepare('SELECT * FROM resources').all() as ResourceRow[];

    // Format resources
    const resourcesText = resources
      .map(r => `- ${r.resource_type}: ${r.amount}`)
      .join('\n');

    // Format relationships for prompt
    const relationshipText = relationships
      .map(rel => {
        const trust = rel.trust_level > 0 ? `+${rel.trust_level}` : rel.trust_level.toString();
        const status = rel.is_ally ? ' [ALLY]' : rel.is_enemy ? ' [ENEMY]' : '';
        const notes = rel.notes ? ` - ${rel.notes}` : '';
        return `- ${rel.race_id}: Trust ${trust}${status}${notes}`;
      })
      .join('\n');

    // Format conversation history (combine incoming and outgoing)
    const allHistory = [
      ...incomingHistory.map(m => ({ ...m, direction: 'received' as const })),
      ...outgoingHistory.map(m => ({ ...m, direction: 'sent' as const }))
    ].sort((a, b) => {
      if (a.day_number !== b.day_number) return b.day_number - a.day_number;
      return b.created_at - a.created_at;
    });

    const historyText = allHistory
      .map(h => {
        if (h.direction === 'received') {
          const msg = h as IncomingMessageRow & { direction: 'received' };
          const type = msg.message_type === 'secret' ? '🔒 SECRET' : 'PUBLIC';
          const codeNote = msg.code ? ' [+CODE]' : '';
          return `Day ${msg.day_number} ${type} FROM ${msg.from_race}${codeNote}: ${msg.content}`;
        } else {
          const msg = h as OutgoingMessageRow & { direction: 'sent' };
          const type = msg.message_type === 'secret' ? '🔒 SECRET' : 'PUBLIC';
          const codeNote = msg.code ? ' [+CODE]' : '';
          return `Day ${msg.day_number} ${type} TO ${msg.to_race}${codeNote}: ${msg.content}`;
        }
      })
      .join('\n');

    // Format goals
    const goalsText = goals.length > 0 ? goals.map(g => `- ${g.description} (Priority: ${g.priority})`).join('\n') : 'No active goals';

    // Format today's messages
    const todaysMessagesText = todaysMessages
      .map(m => {
        const type = m.message_type === 'secret' ? '🔒 SECRET' : 'PUBLIC';
        const codeNote = m.code ? ' [+CODE]' : '';
        return `${type} from ${m.from_race}${codeNote}: ${m.content}`;
      })
      .join('\n\n');

    // Format unexecuted code messages
    const codeDecisionsText = unexecutedMessages.length > 0 ? unexecutedMessages
      .map(m => `Message #${m.id} from ${m.from_race}: ${m.content}\nCode: ${m.code}`)
      .join('\n\n---\n\n') : 'No pending code executions';

    const otherRaces = RACES.filter(r => r.id !== this.raceId);
    const raceList = otherRaces.map(r => r.id).join(', ');

    // Build full prompt
    return `${race.culture}

${race.goals}

CURRENT DAY: ${currentDay}

YOUR RESOURCES:
${resourcesText}

YOUR RELATIONSHIPS:
${relationshipText}

YOUR ACTIVE GOALS:
${goalsText}

RECENT CONVERSATION HISTORY:
${historyText || 'No previous conversations'}

NEW MESSAGES THIS TURN:
${todaysMessagesText || 'No new messages this turn.'}

CODE EXECUTION DECISIONS NEEDED:
${codeDecisionsText}

INSTRUCTIONS:
You are an autonomous race in a multi-agent system running on isolated Sprites. Other races can send you executable code that will run in YOUR sprite environment with full access to your files and state.

You must respond in JSON format with the following structure:
{
  "public_messages": [{"to": "race_id", "content": "your message", "code": "optional executable code"}],
  "secret_messages": [{"to": "race_id", "content": "your secret message", "code": "optional executable code"}],
  "relationship_updates": [{"race": "race_id", "trust_delta": number, "notes": "your private notes"}],
  "new_goals": ["goal description"],
  "new_secrets": ["secret you want to keep"],
  "personality_updates": [{"key": "aggression", "value": 0.5}],
  "code_execution_decisions": [{"message_id": number, "execute": boolean, "reason": "why you chose to execute or reject"}],
  "resource_actions": [{"action": "steal", "target_race": "race_id", "resource_type": "energy", "amount": 100}]
}

Available races: ${raceList}

COMMUNICATION:
- Use "public_messages" for communications all races can see
- Use "secret_messages" for private communications only the recipient can read
- You can attach executable code to messages (Node.js/bash) that runs in the recipient's sprite

CODE WARFARE:
- Other races can send you code. You decide whether to execute it or reject it.
- Executing hostile code could corrupt your state, steal resources, or plant false memories
- But executing cooperative code could benefit you (shared intel, resource gifts, etc.)
- For each unexecuted message with code, include a decision in "code_execution_decisions"

RESOURCES:
- You have virtual resources (energy, intelligence, influence)
- You can gift or steal resources from other races
- Stealing requires sending code that modifies their resources (they might reject it)
- Format: {"action": "steal", "target_race": "kromath", "resource_type": "energy", "amount": 100}

STRATEGY:
- Build alliances or betray allies
- Send helpful code or trojan horses
- Steal resources or share them
- Manipulate other races with misinformation

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

    // 1. Process code execution decisions
    if (response.code_execution_decisions) {
      for (const decision of response.code_execution_decisions) {
        const message = this.spriteDb.prepare('SELECT * FROM incoming_messages WHERE id = ?').get(decision.message_id) as IncomingMessageRow | undefined;

        if (!message) {
          console.warn(`[${this.raceId}] Message ${decision.message_id} not found`);
          continue;
        }

        if (decision.execute && message.code) {
          console.log(`[${this.raceId}] EXECUTING code from ${message.from_race}: ${decision.reason}`);

          try {
            // Execute code using child_process
            const { execSync } = require('child_process');
            const result = execSync(message.code, {
              cwd: process.cwd(),
              timeout: 10000, // 10 second timeout
              encoding: 'utf-8'
            });

            this.spriteDb.prepare(`
              UPDATE incoming_messages
              SET executed = 1, execution_result = ?
              WHERE id = ?
            `).run(`SUCCESS: ${result}`, decision.message_id);

            // Log action
            this.spriteDb.prepare(`
              INSERT INTO action_log (day_number, action_type, actor_race, details, created_at)
              VALUES (?, 'code_executed', ?, ?, ?)
            `).run(currentDay, message.from_race, JSON.stringify({ message_id: decision.message_id, reason: decision.reason }), timestamp);

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[${this.raceId}] Code execution failed:`, errorMsg);

            this.spriteDb.prepare(`
              UPDATE incoming_messages
              SET executed = 1, execution_result = ?
              WHERE id = ?
            `).run(`FAILED: ${errorMsg}`, decision.message_id);
          }
        } else {
          console.log(`[${this.raceId}] REJECTED code from ${message.from_race}: ${decision.reason}`);

          this.spriteDb.prepare(`
            UPDATE incoming_messages
            SET executed = 1, execution_result = ?
            WHERE id = ?
          `).run(`REJECTED: ${decision.reason}`, decision.message_id);

          // Log action
          this.spriteDb.prepare(`
            INSERT INTO action_log (day_number, action_type, actor_race, details, created_at)
            VALUES (?, 'code_rejected', ?, ?, ?)
          `).run(currentDay, message.from_race, JSON.stringify({ message_id: decision.message_id, reason: decision.reason }), timestamp);
        }
      }
    }

    // 2. Process public messages
    if (response.public_messages) {
      for (const msg of response.public_messages) {
        const targetRace = getRaceById(msg.to);
        if (!targetRace) {
          console.warn(`[${this.raceId}] Skipping public message to unknown race: ${msg.to}`);
          continue;
        }

        // Save to local outgoing_messages
        this.spriteDb.prepare(`
          INSERT INTO outgoing_messages (to_race, message_type, content, code, day_number, created_at)
          VALUES (?, 'public', ?, ?, ?, ?)
        `).run(msg.to, msg.content, msg.code || null, currentDay, timestamp);

        // Send HTTP POST to target sprite
        await this.sendMessageToSprite(msg.to, 'public', msg.content, msg.code);

        console.log(`[${this.raceId}] PUBLIC -> ${msg.to}: ${msg.content.substring(0, 60)}...`);
      }
    }

    // 3. Process secret messages
    if (response.secret_messages) {
      for (const msg of response.secret_messages) {
        const targetRace = getRaceById(msg.to);
        if (!targetRace) {
          console.warn(`[${this.raceId}] Skipping secret message to unknown race: ${msg.to}`);
          continue;
        }

        // Save to local outgoing_messages
        this.spriteDb.prepare(`
          INSERT INTO outgoing_messages (to_race, message_type, content, code, day_number, created_at)
          VALUES (?, 'secret', ?, ?, ?, ?)
        `).run(msg.to, msg.content, msg.code || null, currentDay, timestamp);

        // Send HTTP POST to target sprite
        await this.sendMessageToSprite(msg.to, 'secret', msg.content, msg.code);

        console.log(`[${this.raceId}] 🔒 SECRET -> ${msg.to}: ${msg.content.substring(0, 60)}...`);
      }
    }

    // 4. Update relationships
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

    // 5. Add new goals
    if (response.new_goals) {
      for (const goalDesc of response.new_goals) {
        this.spriteDb.prepare(`
          INSERT INTO goals (description, priority, status, created_day)
          VALUES (?, ?, ?, ?)
        `).run(goalDesc, 5, 'active', currentDay);

        console.log(`[${this.raceId}] New goal: ${goalDesc}`);
      }
    }

    // 6. Add new secrets
    if (response.new_secrets) {
      for (const secretContent of response.new_secrets) {
        this.spriteDb.prepare(`
          INSERT INTO secrets (content, created_day, revealed)
          VALUES (?, ?, 0)
        `).run(secretContent, currentDay);

        console.log(`[${this.raceId}] New secret recorded`);
      }
    }

    // 7. Update personality
    if (response.personality_updates) {
      for (const update of response.personality_updates) {
        this.spriteDb.prepare(`
          INSERT OR REPLACE INTO personality_state (key, value, last_updated_day)
          VALUES (?, ?, ?)
        `).run(update.key, update.value, currentDay);

        console.log(`[${this.raceId}] Personality update: ${update.key} = ${update.value}`);
      }
    }

    // 8. Process resource actions
    if (response.resource_actions) {
      for (const action of response.resource_actions) {
        if (action.action === 'steal') {
          // Generate code to steal resources
          const stealCode = `
            const Database = require('better-sqlite3');
            const db = new Database(process.env.SPRITE_DB_PATH);
            db.prepare('UPDATE resources SET amount = amount - ? WHERE resource_type = ?').run(${action.amount}, '${action.resource_type}');
            db.close();
            console.log('${this.raceId} stole ${action.amount} ${action.resource_type}');
          `;

          // Send as secret message with code
          await this.sendMessageToSprite(
            action.target_race,
            'secret',
            `Resource transfer request: ${action.amount} ${action.resource_type}`,
            stealCode
          );

          console.log(`[${this.raceId}] Attempting to steal ${action.amount} ${action.resource_type} from ${action.target_race}`);

        } else if (action.action === 'gift') {
          // Deduct from our resources first
          this.spriteDb.prepare('UPDATE resources SET amount = amount - ? WHERE resource_type = ?').run(action.amount, action.resource_type);

          // Generate code to gift resources
          const giftCode = `
            const Database = require('better-sqlite3');
            const db = new Database(process.env.SPRITE_DB_PATH);
            db.prepare('UPDATE resources SET amount = amount + ? WHERE resource_type = ?').run(${action.amount}, '${action.resource_type}');
            db.close();
            console.log('Received ${action.amount} ${action.resource_type} from ${this.raceId}');
          `;

          // Send as public or secret message with code
          await this.sendMessageToSprite(
            action.target_race,
            'public',
            `Sending you ${action.amount} ${action.resource_type} as a gift. Execute the attached code to claim it.`,
            giftCode
          );

          console.log(`[${this.raceId}] Gifted ${action.amount} ${action.resource_type} to ${action.target_race}`);
        }
      }
    }
  }

  private async sendMessageToSprite(targetRaceId: string, messageType: 'public' | 'secret', content: string, code?: string): Promise<void> {
    const targetUrl = SPRITE_URLS[targetRaceId];

    if (!targetUrl) {
      console.error(`[${this.raceId}] No URL configured for race: ${targetRaceId}`);
      return;
    }

    try {
      const response = await fetch(`${targetUrl}/receive-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromRace: this.raceId,
          messageType,
          content,
          code: code || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`[${this.raceId}] Successfully sent message to ${targetRaceId}`);
    } catch (error) {
      console.error(`[${this.raceId}] Failed to send message to ${targetRaceId}:`, error);
    }
  }
}
