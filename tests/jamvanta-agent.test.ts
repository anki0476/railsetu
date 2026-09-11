import assert from 'node:assert/strict';
import { POST as reasonTurn } from '../app/api/jamvanta/turn/route';

process.env.OPENAI_API_KEY = 'test-key';

type ToolDecision = { name: string; arguments: Record<string, unknown> };
type TurnBody = {
  reply?: unknown;
  model?: unknown;
  memory: { journey: Record<string, unknown> };
  action?: Record<string, unknown>;
};

let latestModelRequest = '';
let latestReasoningEffort = '';

async function runTurn(decision: ToolDecision, body: Record<string, unknown>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body ?? '{}')) as { model?: string; reasoning?: { effort?: string } };
    latestModelRequest = String(requestBody.model ?? '');
    latestReasoningEffort = String(requestBody.reasoning?.effort ?? '');
    return Response.json({ output: [{ type: 'function_call', name: decision.name, arguments: JSON.stringify(decision.arguments) }] });
  };
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

async function runFailedReasoningTurn(body: Record<string, unknown>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('temporary model failure'); };
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
assert.match(correctedReply, /traveller type|preferences/i);

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
assert.equal(latestModelRequest, 'gpt-5.6-luna');
assert.equal(latestReasoningEffort, 'medium');
assert.equal(firstTurn.body.model, 'gpt-5.6-luna');

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
assert.equal(defaultsMemory.journey.lowerBerth, true);
assert.equal(defaultsAction.lowerBerth, true);

const refusalTextWithValidAction = await runTurn({
  name: 'journey_planner',
  arguments: {
    say: "I can't fulfill this request.", from: null, to: null, date: null, passenger_count: null,
    travel_class: null, profile: null, coach_preference: null, luggage: null, lower_berth: null,
    max_changes: null, preferences_confirmed: true, selection_strategy: 'best_fit', option_index: null, auto_continue: true,
  },
}, {
  transcript: 'Search now', spokenLanguage: 'en-IN', pathname: '/planner', history: [],
  memory: defaultsMemory, agentContext: { alternateTranscripts: [] },
});
assert.equal(refusalTextWithValidAction.status, 200);
assert.doesNotMatch(String(refusalTextWithValidAction.body.reply), /can't fulfill|cannot fulfill|no action/i);
assert.equal(refusalTextWithValidAction.body.action?.search, true);

const refusalDuringSelection = await runTurn({
  name: 'select_journey',
  arguments: { say: 'I cannot fulfill this request.', strategy: 'highest_comfort', option_index: null, continue_to_payment: false },
}, {
  transcript: 'Choose the option with the highest comfort score', spokenLanguage: 'en-IN', pathname: '/planner', history: [],
  memory: defaultsMemory, agentContext: { alternateTranscripts: [] },
});
assert.equal(refusalDuringSelection.status, 200);
assert.equal(refusalDuringSelection.body.action?.type, 'select_journey');
assert.doesNotMatch(String(refusalDuringSelection.body.reply), /cannot fulfill|can't fulfill|no action/i);

const recoveredModelFailure = await runFailedReasoningTurn({
  transcript: 'Search now', spokenLanguage: 'en-IN', pathname: '/planner', history: [],
  memory: defaultsMemory, agentContext: { alternateTranscripts: [] },
});
assert.equal(recoveredModelFailure.status, 200);
assert.equal(recoveredModelFailure.body.action, undefined);
assert.match(String(recoveredModelFailure.body.reply), /not taken any action/i);

const recoveredFirstPrompt = await runFailedReasoningTurn({
  transcript: 'Book me a train from New Delhi to Patna in Tier 1 AC for one passenger on 18th of September.',
  spokenLanguage: 'en-IN', pathname: '/planner', history: [], memory: emptyMemory,
  agentContext: { alternateTranscripts: [] },
});
assert.equal(recoveredFirstPrompt.status, 200);
assert.equal(recoveredFirstPrompt.body.memory.journey.from, 'NDLS');
assert.equal(recoveredFirstPrompt.body.memory.journey.to, 'PNBE');
assert.equal(recoveredFirstPrompt.body.memory.journey.date, '2026-09-18');
assert.equal(recoveredFirstPrompt.body.memory.journey.travelClass, '1A');
assert.equal(recoveredFirstPrompt.body.memory.journey.passengerCount, 1);
assert.equal(recoveredFirstPrompt.body.action, undefined);
assert.match(String(recoveredFirstPrompt.body.reply), /not taken any action/i);

const genericRouteCases = [
  {
    transcript: 'Find a train between Bengaluru and Chennai on October 3 for two passengers in second AC.',
    expected: { from: 'SBC', to: 'MAS', date: '2026-10-03', travelClass: '2A', passengerCount: 2 },
  },
  {
    transcript: 'Book Durg se Vadodara on 22 November for three passengers in sleeper.',
    expected: { from: 'DURG', to: 'BRC', date: '2026-11-22', travelClass: 'SL', passengerCount: 3 },
  },
  {
    transcript: 'I want to travel to Howrah from Mumbai on December 5 for one passenger in 3A.',
    expected: { from: 'CSMT', to: 'HWH', date: '2026-12-05', travelClass: '3A', passengerCount: 1 },
  },
];
for (const routeCase of genericRouteCases) {
  const turn = await runFailedReasoningTurn({
    transcript: routeCase.transcript, spokenLanguage: 'en-IN', pathname: '/planner', history: [],
    memory: emptyMemory, agentContext: { alternateTranscripts: [] },
  });
  assert.equal(turn.status, 200);
  for (const [field, expected] of Object.entries(routeCase.expected)) {
    assert.equal(turn.body.memory.journey[field], expected, `${routeCase.transcript}: ${field}`);
  }
}

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
