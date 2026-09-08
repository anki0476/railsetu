import assert from 'node:assert/strict';
import { POST as reasonTurn } from '../app/api/jamvanta/turn/route';

process.env.OPENAI_API_KEY = 'test-key';

type ToolDecision = { name: string; arguments: Record<string, unknown> };
type TurnBody = {
  reply?: unknown;
  memory: { journey: Record<string, unknown> };
  action?: Record<string, unknown>;
};

async function runTurn(decision: ToolDecision, body: Record<string, unknown>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    output: [{ type: 'function_call', name: decision.name, arguments: JSON.stringify(decision.arguments) }],
  });
  try {
    const response = await reasonTurn(new Request('http://localhost/api/jamvanta/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() as TurnBody };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const emptyMemory = { journey: {}, payment: {}, stage: 'collecting', lastPath: '/planner' };

const correctedStation = await runTurn({
  name: 'ask_user',
  arguments: { say: 'Jamvanta needs the departure station.', missing_field: 'departure station' },
}, {
  transcript: 'Book a train from Fort to Vadodara on 2026-09-29 for one passenger in first AC',
  spokenLanguage: 'en-IN', pathname: '/planner', history: [], memory: emptyMemory,
  agentContext: { alternateTranscripts: ['Book a train from Durg to Vadodara on 2026-09-29 for one passenger in first AC'] },
});
assert.equal(correctedStation.status, 200);
const correctedMemory = correctedStation.body.memory;
const correctedReply = String(correctedStation.body.reply);
assert.equal(correctedMemory.journey.from, 'DURG');
assert.equal(correctedMemory.journey.to, 'BRC');
assert.doesNotMatch(correctedReply, /Jamvanta|departure station/i);
assert.match(correctedReply, /journey date/i);

const firstTurn = await runTurn({
  name: 'journey_planner',
  arguments: {
    say: 'Jamvanta has saved those details.', from: null, to: null, date: '2026-09-29', passenger_count: 1,
    travel_class: '1A', profile: null, coach_preference: null, luggage: null, lower_berth: null,
    max_changes: null, preferences_confirmed: false, selection_strategy: 'best_fit', option_index: null, auto_continue: true,
  },
}, {
  transcript: 'Book a train from Durg to Vadodara on 29 September for one passenger in first AC',
  spokenLanguage: 'en-IN', pathname: '/planner', history: [], memory: emptyMemory, agentContext: { alternateTranscripts: [] },
});
const firstMemory = firstTurn.body.memory;
assert.equal(firstMemory.journey.from, 'DURG');
assert.equal(firstMemory.journey.to, 'BRC');
assert.equal(firstMemory.journey.date, '2026-09-29');
assert.equal(firstMemory.journey.travelClass, '1A');
assert.match(String(firstTurn.body.reply), /^I\b/);

const defaultsTurn = await runTurn({
  name: 'journey_planner',
  arguments: {
    say: 'I have applied your defaults and I am searching.', from: null, to: null, date: null, passenger_count: null,
    travel_class: null, profile: 'standard', coach_preference: 'same', luggage: 'light', lower_berth: false,
    max_changes: 1, preferences_confirmed: true, selection_strategy: 'best_fit', option_index: null, auto_continue: true,
  },
}, {
  transcript: 'Yes, proceed with recommended defaults', spokenLanguage: 'en-IN', pathname: '/planner', history: [],
  memory: firstMemory, agentContext: { alternateTranscripts: [] },
});
const defaultsMemory = defaultsTurn.body.memory;
const defaultsAction = defaultsTurn.body.action ?? {};
assert.equal(defaultsMemory.journey.from, 'DURG');
assert.equal(defaultsMemory.journey.to, 'BRC');
assert.equal(defaultsAction.search, true);
assert.equal(defaultsAction.from, 'DURG');
assert.equal(defaultsAction.to, 'BRC');

const summaryReply = await runTurn({
  name: 'navigate',
  arguments: { say: 'User asked to return to the planner', path: '/planner' },
}, {
  transcript: 'Please continue', spokenLanguage: 'en-IN', pathname: '/planner', history: [],
  memory: emptyMemory, agentContext: { alternateTranscripts: [] },
});
assert.match(String(summaryReply.body.reply), /^I\b/);
assert.doesNotMatch(String(summaryReply.body.reply), /^User asked/i);

console.log('Jamvanta agent regression checks passed.');
