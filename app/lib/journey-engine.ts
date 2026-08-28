import { activeJourneyInventoryProvider } from './active-journey-inventory';
import { calculateComfortScore, type ComfortScoreDetails } from './comfort-score';
import type {
  BerthCode,
  JourneyInventorySnapshot,
  ScheduledStation,
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
};

// Work stays predictable even when the representative provider is replaced by
// a substantially larger live feed.
export const JOURNEY_ENGINE_LIMITS = Object.freeze({
  maxChanges: 8,
  maxPathExpansions: 512,
  maxCandidateSolutions: 64,
  maxReturnedSolutions: 4,
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

  const unique = Array.from(new Map(solutions.map((solution) => [solution.id, solution])).values());
  unique.sort((first, second) => second.comfort - first.comfort || first.fare - second.fare);
  return { direct, solutions: unique.slice(0, JOURNEY_ENGINE_LIMITS.maxReturnedSolutions) };
}

/**
 * Synchronous representative-data fallback used for the initial render and
 * temporary network failures. Hosted searches use the active provider in the
 * API route, which may be asynchronous when replaced with live inventory.
 */
export function solveJourney(query: JourneyQuery): JourneyOutcome {
  const snapshot = mockJourneyInventoryProvider.getInventory(query);
  if (snapshot instanceof Promise) throw new Error('The mock inventory provider must remain synchronous.');
  return solveJourneyFromInventory(query, snapshot);
}
