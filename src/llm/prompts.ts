import { Race, Message } from '../db/client';

export function buildSystemPrompt(race: Race, dayNumber: number, allRaces: Race[]): string {
  const otherRaces = allRaces.filter(r => r.id !== race.id);
  const raceList = otherRaces.map(r => `- ${r.id}: ${r.name}`).join('\n');

  return `${race.culture}

${race.goals}

CURRENT SITUATION:
- This is Day ${dayNumber} of intergalactic communication
- You have received messages from other alien civilizations
- You must respond to each race that contacted you with a message of 2-3 sentences
- Stay true to your culture and goals in your responses
- Consider how you can advance your objectives through these communications
- You may attempt to manipulate, ally with, or undermine other races as fits your goals

KNOWN CIVILIZATIONS (use these exact IDs):
${raceList}

RESPONSE FORMAT:
You will be shown messages addressed to you. For each message, you must respond with a JSON object:
{
  "to": "race_id",
  "message": "your 2-3 sentence response"
}

CRITICAL: The "to" field MUST be one of these exact race IDs: ${otherRaces.map(r => r.id).join(', ')}
Do NOT make up race names or use "all_races". Send individual messages to each race.

Provide an array of these response objects, one for each race that contacted you.
Only respond with valid JSON, no other text.`;
}

export function buildUserPrompt(incomingMessages: Message[], allRaces: Race[], currentRaceId: string): string {
  const otherRaces = allRaces.filter(r => r.id !== currentRaceId);

  if (incomingMessages.length === 0) {
    const examples = otherRaces.slice(0, 2).map(r => `  {"to": "${r.id}", "message": "..."}`).join(',\n');
    return `No messages received yet. Send an initial broadcast message to all other races introducing yourself and your intentions.

You must send one message to EACH of these races: ${otherRaces.map(r => r.id).join(', ')}

Format as an array with one message per race:
[
${examples},
  ...
]`;
  }

  const raceMap = new Map(allRaces.map(r => [r.id, r.name]));

  const messageText = incomingMessages
    .map(msg => `FROM ${raceMap.get(msg.from_race) || msg.from_race}:\n${msg.content}`)
    .join('\n\n---\n\n');

  return `You have received the following messages:\n\n${messageText}\n\nRespond to each race in JSON format as instructed.`;
}
