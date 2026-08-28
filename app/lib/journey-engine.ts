import { activeJourneyInventoryProvider } from './active-journey-inventory';
import { calculateComfortScore, type ComfortScoreDetails } from './comfort-score';
import type {
  BerthCode,
  JourneyInventorySnapshot,
  ScheduledStation,
  JourneyInventoryProvider,
  TrainInventoryRecord,
} from './journey-inventory-provider';
import { mockJourneyInventoryProvider } from './mock-journey-inventory';

export type TravellerProfile = 'standard' | 'elderly' | 'family';
export type CoachPreference = 'same' | 'nearby' | 'any';
export type LuggageLevel = 'none' | 'light' | 'heavy';

export type JourneyQuery = {
  from: string;
  to: string;
  travelClass: string;
  profile: TravellerProfile;
  coachPreference: CoachPreference;
  luggage: LuggageLevel;
  maxChanges: number;
  lowerBerth: boolean;
};

export type JourneyLeg = {
  id: string;
  from: ScheduledStation;
  to: ScheduledStation;
  coach: string;
  seat: string;
  berth: BerthCode;
  fare: number;
};

export type JourneySolution = {
  id: string;
  trainNumber: string;
  trainName: string;
  duration: string;
  legs: JourneyLeg[];
  changes: number;
  coachChanges: number;
  walkingMetres: number;
  fare: number;
  comfort: number;
  comfortDetails: ComfortScoreDetails;
  highlights: string[];
};

export type JourneyOutcome = {
  direct: { label: string; fare: number } | null;
  solutions: JourneySolution[];
  recommendations: JourneyRecommendation[];
};

export type JourneyRecommendation = {
  id: string;
  title: string;
  explanation: string;
  changes: string[];
  query: JourneyQuery;
  solutionCount: number;
  bestComfort: number;
};

// Work stays predictable even when the representative provider is replaced by
// a substantially larger live feed.
export const JOURNEY_ENGINE_LIMITS = Object.freeze({
  maxChanges: 8,
  maxPathExpansions: 512,
  maxCandidateSolutions: 64,
  maxReturnedSolutions: 4,
  maxRecommendationCandidates: 48,
  maxRecommendations: 3,
});

export const stationOptions = [...activeJourneyInventoryProvider.listStations()];

function coachDistance(first: string, second: string) {
  if (first === second) return 0;
  const firstType = first.replace(/\d/g, '');
  const secondType = second.replace(/\d/g, '');
  const firstNumber = Number(first.match(/\d+/)?.[0] ?? 0);
  const secondNumber = Number(second.match(/\d+/)?.[0] ?? 0);
  return firstType === secondType ? Math.max(1, Math.abs(firstNumber - secondNumber)) : 4;
}

function buildSolution(train: TrainInventoryRecord, legs: JourneyLeg[], query: JourneyQuery): JourneySolution | null {
  const transitions = legs.slice(1).map((leg, index) => coachDistance(legs[index].coach, leg.coach));
  const coachChanges = transitions.filter((distance) => distance > 0).length;
  const largestCoachMove = Math.max(0, ...transitions);

  if (query.coachPreference === 'same' && coachChanges > 0) return null;
  if (query.coachPreference === 'nearby' && largestCoachMove > 2) return null;

  const changes = Math.max(0, legs.length - 1);
  const walkingMetres = transitions.reduce((total, distance) => total + (distance === 0 ? 0 : 14 + distance * 18), 0);
  const fare = legs.reduce((total, leg) => total + leg.fare, 0);
  const comfortDetails = calculateComfortScore(legs, transitions, query);
  const sleepingBerths = legs.filter((leg) => ['LB', 'MB', 'UB', 'SL'].includes(leg.berth));

  const highlights = [
    coachChanges === 0 ? 'No coach change' : `${coachChanges} coach change${coachChanges > 1 ? 's' : ''}`,
    walkingMetres === 0 ? 'Zero coach walking' : `Approx. ${walkingMetres} m coach walk`,
    sleepingBerths.some((leg) => leg.berth === 'LB') ? 'Lower berth included' : 'Seat continuity prioritised',
  ];

  return {
    id: `${train.number}-${legs.map((leg) => leg.id).join('-')}`,
    trainNumber: train.number,
    trainName: train.name,
    duration: train.duration,
    legs,
    changes,
    coachChanges,
    walkingMetres,
    fare,
    comfort: comfortDetails.score,
    comfortDetails,
    highlights,
  };
}

export function solveJourneyFromInventory(query: JourneyQuery, snapshot: JourneyInventorySnapshot): JourneyOutcome {
  const solutions: JourneySolution[] = [];
  let direct: { label: string; fare: number } | null = null;
  let pathExpansions = 0;

  snapshot.trains.forEach((train) => {
    const fromIndex = train.stations.findIndex((station) => station.code === query.from);
    const toIndex = train.stations.findIndex((station) => station.code === query.to);
    if (fromIndex < 0 || toIndex <= fromIndex) return;

    direct ??= train.direct;
    const stationByCode = new Map(train.stations.map((station) => [station.code, station]));
    const indexByCode = new Map(train.stations.map((station, index) => [station.code, index]));
    const inventory = train.inventory.filter((leg) => leg.travelClass === query.travelClass);
    const maxLegs = Math.min(
      JOURNEY_ENGINE_LIMITS.maxChanges,
      Math.max(0, Number.isFinite(query.maxChanges) ? Math.floor(query.maxChanges) : 0),
    ) + 1;

    const walk = (currentCode: string, path: JourneyLeg[]) => {
      if (
        pathExpansions >= JOURNEY_ENGINE_LIMITS.maxPathExpansions
        || solutions.length >= JOURNEY_ENGINE_LIMITS.maxCandidateSolutions
      ) return;
      pathExpansions += 1;
      const currentIndex = indexByCode.get(currentCode) ?? -1;
      if (currentCode === query.to) {
        const solution = buildSolution(train, path, query);
        if (solution) solutions.push(solution);
        return;
      }
      if (path.length >= maxLegs) return;

      inventory.forEach((leg) => {
        if (
          pathExpansions >= JOURNEY_ENGINE_LIMITS.maxPathExpansions
          || solutions.length >= JOURNEY_ENGINE_LIMITS.maxCandidateSolutions
        ) return;
        const legToIndex = indexByCode.get(leg.to) ?? -1;
        if (leg.from !== currentCode || legToIndex <= currentIndex || legToIndex > toIndex) return;
        const from = stationByCode.get(leg.from);
        const to = stationByCode.get(leg.to);
        if (!from || !to) return;
        walk(leg.to, [...path, { ...leg, from, to }]);
      });
    };

    walk(query.from, []);
  });

  solutions.sort((first, second) => second.comfort - first.comfort || first.fare - second.fare);
  const seenTrains = new Set<string>();
  const uniqueByTrain = solutions.filter((solution) => {
    if (seenTrains.has(solution.trainNumber)) return false;
    seenTrains.add(solution.trainNumber);
    return true;
  });
  return { direct, solutions: uniqueByTrain.slice(0, JOURNEY_ENGINE_LIMITS.maxReturnedSolutions), recommendations: [] };
}

const classNames: Readonly<Record<string, string>> = {
  '1A': 'AC First Class (1A)',
  '2A': 'AC 2 Tier (2A)',
  '3A': 'AC 3 Tier (3A)',
  '3E': 'AC 3 Economy (3E)',
  SL: 'Sleeper (SL)',
  CC: 'AC Chair Car (CC)',
  EC: 'Executive Chair Car (EC)',
};

function recommendationCandidates(query: JourneyQuery) {
  const candidates: JourneyQuery[] = [];
  const seen = new Set<string>();
  const classes = ['3A', 'SL', '2A', '3E', 'CC', '1A', 'EC'].filter((value) => value !== query.travelClass);
  const coaches: CoachPreference[] = query.coachPreference === 'same'
    ? ['nearby', 'any']
    : query.coachPreference === 'nearby' ? ['any'] : [];
  const changeLimits = [1, 2, 3, 4, 6, JOURNEY_ENGINE_LIMITS.maxChanges]
    .filter((value, index, values) => value > query.maxChanges && values.indexOf(value) === index);

  const add = (changes: Partial<JourneyQuery>) => {
    const candidate = { ...query, ...changes };
    const key = `${candidate.travelClass}|${candidate.coachPreference}|${candidate.maxChanges}`;
    if (seen.has(key) || key === `${query.travelClass}|${query.coachPreference}|${query.maxChanges}`) return;
    seen.add(key);
    if (candidates.length < JOURNEY_ENGINE_LIMITS.maxRecommendationCandidates) candidates.push(candidate);
  };

  changeLimits.forEach((maxChanges) => add({ maxChanges }));
  coaches.forEach((coachPreference) => add({ coachPreference }));
  classes.forEach((travelClass) => add({ travelClass }));
  coaches.forEach((coachPreference) => changeLimits.forEach((maxChanges) => add({ coachPreference, maxChanges })));
  classes.forEach((travelClass) => changeLimits.forEach((maxChanges) => add({ travelClass, maxChanges })));
  classes.forEach((travelClass) => coaches.forEach((coachPreference) => add({ travelClass, coachPreference })));
  classes.forEach((travelClass) => coaches.forEach((coachPreference) => changeLimits.forEach((maxChanges) => add({ travelClass, coachPreference, maxChanges }))));
  return candidates;
}

function recommendationFor(original: JourneyQuery, query: JourneyQuery, outcome: JourneyOutcome): JourneyRecommendation {
  const changes: string[] = [];
  if (query.travelClass !== original.travelClass) changes.push(`Switch to ${classNames[query.travelClass] ?? query.travelClass}`);
  if (query.coachPreference !== original.coachPreference) {
    changes.push(query.coachPreference === 'nearby' ? 'Allow nearby coach changes' : 'Allow any coach change');
  }
  if (query.maxChanges !== original.maxChanges) {
    changes.push(`Allow up to ${query.maxChanges} seat change${query.maxChanges === 1 ? '' : 's'}`);
  }
  const best = outcome.solutions[0];
  return {
    id: `${query.travelClass}-${query.coachPreference}-${query.maxChanges}`,
    title: changes.length === 1 ? changes[0] : `Adjust ${changes.length} constraints`,
    explanation: `${outcome.solutions.length} confirmed path${outcome.solutions.length === 1 ? '' : 's'} available; best match is ${best.trainNumber} ${best.trainName} with a Comfort Score of ${best.comfort}.`,
    changes,
    query,
    solutionCount: outcome.solutions.length,
    bestComfort: best.comfort,
  };
}

export async function findJourneyRecommendations(
  query: JourneyQuery,
  provider: JourneyInventoryProvider,
): Promise<JourneyRecommendation[]> {
  const snapshots = new Map<string, Promise<JourneyInventorySnapshot>>();
  const recommendations: JourneyRecommendation[] = [];
  for (const candidate of recommendationCandidates(query)) {
    let snapshot = snapshots.get(candidate.travelClass);
    if (!snapshot) {
      snapshot = Promise.resolve(provider.getInventory(candidate));
      snapshots.set(candidate.travelClass, snapshot);
    }
    const outcome = solveJourneyFromInventory(candidate, await snapshot);
    if (!outcome.solutions.length) continue;
    recommendations.push(recommendationFor(query, candidate, outcome));
    if (recommendations.length >= JOURNEY_ENGINE_LIMITS.maxRecommendations) break;
  }
  return recommendations;
}

/**
 * Synchronous representative-data fallback used for the initial render and
 * temporary network failures. Hosted searches use the active provider in the
 * API route, which may be asynchronous when replaced with live inventory.
 */
export function solveJourney(query: JourneyQuery): JourneyOutcome {
  const snapshot = mockJourneyInventoryProvider.getInventory(query);
  if (snapshot instanceof Promise) throw new Error('The mock inventory provider must remain synchronous.');
  const outcome = solveJourneyFromInventory(query, snapshot);
  if (outcome.solutions.length) return outcome;
  const snapshots = new Map<string, JourneyInventorySnapshot>([[query.travelClass, snapshot]]);
  for (const candidate of recommendationCandidates(query)) {
    let candidateSnapshot = snapshots.get(candidate.travelClass);
    if (!candidateSnapshot) {
      const loaded = mockJourneyInventoryProvider.getInventory(candidate);
      if (loaded instanceof Promise) throw new Error('The mock inventory provider must remain synchronous.');
      candidateSnapshot = loaded;
      snapshots.set(candidate.travelClass, loaded);
    }
    const candidateOutcome = solveJourneyFromInventory(candidate, candidateSnapshot);
    if (!candidateOutcome.solutions.length) continue;
    outcome.recommendations.push(recommendationFor(query, candidate, candidateOutcome));
    if (outcome.recommendations.length >= JOURNEY_ENGINE_LIMITS.maxRecommendations) break;
  }
  return outcome;
}
