import {
  JOURNEY_ENGINE_LIMITS,
  stationOptions,
  type CoachPreference,
  type JourneyQuery,
  type LuggageLevel,
  type TravellerProfile,
} from './journey-engine';

export const JOURNEY_REQUEST_LIMIT_BYTES = 4_096;

const stationCodes = new Set(stationOptions.map((station) => station.code));
const travelClasses = new Set(['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC']);
const profiles = new Set<TravellerProfile>(['standard', 'elderly', 'family']);
const coachPreferences = new Set<CoachPreference>(['same', 'nearby', 'any']);
const luggageLevels = new Set<LuggageLevel>(['none', 'light', 'heavy']);

export class JourneyRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'JourneyRequestError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new JourneyRequestError('invalid_body', 'The request body must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, field: string): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new JourneyRequestError('invalid_' + field, 'Unsupported ' + field + '.');
  }
  return value as T;
}

export function parseJourneyRequest(value: unknown): JourneyQuery {
  const body = record(value);
  const source = record(body.query ?? body);
  const from = enumValue(source.from, stationCodes, 'from');
  const to = enumValue(source.to, stationCodes, 'to');
  if (from === to) throw new JourneyRequestError('same_station', 'Departure and arrival stations must differ.');

  const maxChanges = source.maxChanges;
  if (typeof maxChanges !== 'number' || !Number.isFinite(maxChanges) || !Number.isInteger(maxChanges)) {
    throw new JourneyRequestError('invalid_max_changes', 'Maximum changes must be a whole number.');
  }

  if (typeof source.lowerBerth !== 'boolean') {
    throw new JourneyRequestError('invalid_lower_berth', 'Lower-berth preference must be true or false.');
  }

  return {
    from,
    to,
    travelClass: enumValue(source.travelClass, travelClasses, 'travel_class'),
    profile: enumValue(source.profile, profiles, 'profile'),
    coachPreference: enumValue(source.coachPreference, coachPreferences, 'coach_preference'),
    luggage: enumValue(source.luggage, luggageLevels, 'luggage'),
    maxChanges: Math.max(0, Math.min(JOURNEY_ENGINE_LIMITS.maxChanges, maxChanges)),
    lowerBerth: source.lowerBerth,
  };
}

export function journeyCacheKey(query: JourneyQuery) {
  return [
    query.from,
    query.to,
    query.travelClass,
    query.profile,
    query.coachPreference,
    query.luggage,
    query.maxChanges,
    query.lowerBerth ? 1 : 0,
  ].join('|');
}
