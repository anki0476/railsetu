import type { JourneyOutcome, JourneyQuery } from './journey-engine';

type JourneySearchPayload = {
  outcome?: JourneyOutcome;
};

function isJourneyOutcome(value: unknown): value is JourneyOutcome {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<JourneyOutcome>;
  return Array.isArray(candidate.solutions) && (candidate.direct === null || typeof candidate.direct === 'object');
}

export async function searchJourney(query: JourneyQuery, signal: AbortSignal): Promise<JourneyOutcome> {
  const response = await fetch('/api/journeys/search', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });

  if (!response.ok) throw new Error('Journey search failed with status ' + response.status + '.');
  const payload = await response.json() as JourneySearchPayload;
  if (!isJourneyOutcome(payload.outcome)) throw new Error('Journey search returned an invalid response.');
  return payload.outcome;
}
