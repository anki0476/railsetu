export type TravellerProfile = 'standard' | 'elderly' | 'family';
export type CoachPreference = 'same' | 'nearby' | 'any';
export type LuggageLevel = 'light' | 'heavy';

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

type Station = {
  code: string;
  name: string;
  time: string;
};

export type JourneyLeg = {
  id: string;
  from: Station;
  to: Station;
  coach: string;
  seat: string;
  berth: 'LB' | 'MB' | 'UB' | 'SL';
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
  highlights: string[];
};

type InventoryLeg = Omit<JourneyLeg, 'from' | 'to'> & {
  from: string;
  to: string;
  travelClass: string;
};

type TrainInventory = {
  number: string;
  name: string;
  duration: string;
  stations: Station[];
  direct: { label: string; fare: number };
  inventory: InventoryLeg[];
};

const trains: TrainInventory[] = [
  {
    number: '12310',
    name: 'Magadh Express',
    duration: '13h 30m',
    stations: [
      { code: 'NDLS', name: 'New Delhi', time: '20:10' },
      { code: 'ALJN', name: 'Aligarh Junction', time: '21:48' },
      { code: 'CNB', name: 'Kanpur Junction', time: '01:05' },
      { code: 'PRYJ', name: 'Prayagraj Junction', time: '03:25' },
      { code: 'PNBE', name: 'Patna Junction', time: '09:40' },
    ],
    direct: { label: 'WL 46', fare: 1450 },
    inventory: [
      { id: 'mag-cnb-1', from: 'NDLS', to: 'CNB', coach: 'B2', seat: '34', berth: 'LB', fare: 735, travelClass: '3A' },
      { id: 'mag-cnb-2', from: 'CNB', to: 'PNBE', coach: 'B2', seat: '41', berth: 'SL', fare: 705, travelClass: '3A' },
      { id: 'mag-pryj-1', from: 'NDLS', to: 'PRYJ', coach: 'B1', seat: '22', berth: 'LB', fare: 870, travelClass: '3A' },
      { id: 'mag-pryj-2', from: 'PRYJ', to: 'PNBE', coach: 'B3', seat: '18', berth: 'MB', fare: 545, travelClass: '3A' },
      { id: 'mag-aljn-1', from: 'NDLS', to: 'ALJN', coach: 'A1', seat: '15', berth: 'LB', fare: 410, travelClass: '3A' },
      { id: 'mag-aljn-2', from: 'ALJN', to: 'PNBE', coach: 'A2', seat: '29', berth: 'UB', fare: 1160, travelClass: '3A' },
      { id: 'mag-local-1', from: 'CNB', to: 'PRYJ', coach: 'B4', seat: '11', berth: 'LB', fare: 260, travelClass: '3A' },
    ],
  },
  {
    number: '12702',
    name: 'Hussainsagar Express',
    duration: '11h 45m',
    stations: [
      { code: 'PUNE', name: 'Pune Junction', time: '18:35' },
      { code: 'SUR', name: 'Solapur', time: '22:10' },
      { code: 'KLBG', name: 'Kalaburagi', time: '00:35' },
      { code: 'WADI', name: 'Wadi Junction', time: '02:05' },
      { code: 'HYB', name: 'Hyderabad Deccan', time: '06:20' },
    ],
    direct: { label: 'WL 31', fare: 1420 },
    inventory: [
      { id: 'hus-sur-1', from: 'PUNE', to: 'SUR', coach: 'B2', seat: '28', berth: 'LB', fare: 520, travelClass: '3A' },
      { id: 'hus-sur-2', from: 'SUR', to: 'HYB', coach: 'B2', seat: '35', berth: 'SL', fare: 910, travelClass: '3A' },
      { id: 'hus-wadi-1', from: 'PUNE', to: 'WADI', coach: 'B1', seat: '18', berth: 'LB', fare: 960, travelClass: '3A' },
      { id: 'hus-wadi-2', from: 'WADI', to: 'HYB', coach: 'B3', seat: '42', berth: 'UB', fare: 410, travelClass: '3A' },
      { id: 'hus-klbg-1', from: 'PUNE', to: 'KLBG', coach: 'B4', seat: '21', berth: 'SL', fare: 730, travelClass: '3A' },
      { id: 'hus-klbg-2', from: 'KLBG', to: 'HYB', coach: 'B5', seat: '12', berth: 'LB', fare: 640, travelClass: '3A' },
    ],
  },
  {
    number: '12657',
    name: 'Chennai Mail',
    duration: '6h 40m',
    stations: [
      { code: 'MAS', name: 'MGR Chennai Central', time: '22:50' },
      { code: 'KPD', name: 'Katpadi Junction', time: '00:45' },
      { code: 'JTJ', name: 'Jolarpettai Junction', time: '02:15' },
      { code: 'KJM', name: 'Krishnarajapuram', time: '04:50' },
      { code: 'SBC', name: 'KSR Bengaluru', time: '05:30' },
    ],
    direct: { label: 'WL 28', fare: 1340 },
    inventory: [
      { id: 'mas-kpd-1', from: 'MAS', to: 'KPD', coach: 'A1', seat: '12', berth: 'LB', fare: 480, travelClass: '3A' },
      { id: 'mas-kpd-2', from: 'KPD', to: 'SBC', coach: 'A1', seat: '19', berth: 'SL', fare: 960, travelClass: '3A' },
      { id: 'mas-jtj-1', from: 'MAS', to: 'JTJ', coach: 'B2', seat: '31', berth: 'LB', fare: 720, travelClass: '3A' },
      { id: 'mas-jtj-2', from: 'JTJ', to: 'SBC', coach: 'B3', seat: '42', berth: 'UB', fare: 650, travelClass: '3A' },
      { id: 'mas-kjm-1', from: 'MAS', to: 'KJM', coach: 'B1', seat: '14', berth: 'LB', fare: 1080, travelClass: '3A' },
      { id: 'mas-kjm-2', from: 'KJM', to: 'SBC', coach: 'B1', seat: '23', berth: 'SL', fare: 280, travelClass: '3A' },
    ],
  },
];

export const stationOptions = Array.from(
  new Map(trains.flatMap((train) => train.stations.map((station) => [station.code, station]))).values(),
);

function coachDistance(first: string, second: string) {
  if (first === second) return 0;
  const firstType = first.replace(/\d/g, '');
  const secondType = second.replace(/\d/g, '');
  const firstNumber = Number(first.match(/\d+/)?.[0] ?? 0);
  const secondNumber = Number(second.match(/\d+/)?.[0] ?? 0);
  return firstType === secondType ? Math.max(1, Math.abs(firstNumber - secondNumber)) : 4;
}

function buildSolution(train: TrainInventory, legs: JourneyLeg[], query: JourneyQuery): JourneySolution | null {
  const transitions = legs.slice(1).map((leg, index) => coachDistance(legs[index].coach, leg.coach));
  const coachChanges = transitions.filter((distance) => distance > 0).length;
  const largestCoachMove = Math.max(0, ...transitions);

  if (query.coachPreference === 'same' && coachChanges > 0) return null;
  if (query.coachPreference === 'nearby' && largestCoachMove > 2) return null;

  const changes = Math.max(0, legs.length - 1);
  const walkingMetres = transitions.reduce((total, distance) => total + (distance === 0 ? 0 : 14 + distance * 18), 0);
  const fare = legs.reduce((total, leg) => total + leg.fare, 0);
  const nonLowerBerths = legs.filter((leg) => leg.berth !== 'LB').length;
  const mobilityPenalty = query.profile === 'elderly' ? walkingMetres * 0.2 : query.profile === 'family' ? walkingMetres * 0.11 : walkingMetres * 0.06;
  const luggagePenalty = query.luggage === 'heavy' ? changes * 5 + coachChanges * 8 : 0;
  const berthPenalty = query.lowerBerth ? nonLowerBerths * 3 : 0;
  const comfort = Math.max(52, Math.min(98, Math.round(99 - changes * 7 - coachChanges * 8 - mobilityPenalty - luggagePenalty - berthPenalty)));

  const highlights = [
    coachChanges === 0 ? 'No coach change' : `${coachChanges} coach change${coachChanges > 1 ? 's' : ''}`,
    walkingMetres === 0 ? 'Zero coach walking' : `Approx. ${walkingMetres} m coach walk`,
    legs.some((leg) => leg.berth === 'LB') ? 'Lower berth included' : 'Seat continuity prioritised',
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
    comfort,
    highlights,
  };
}

export function solveJourney(query: JourneyQuery) {
  const solutions: JourneySolution[] = [];
  let direct: { label: string; fare: number } | null = null;

  trains.forEach((train) => {
    const fromIndex = train.stations.findIndex((station) => station.code === query.from);
    const toIndex = train.stations.findIndex((station) => station.code === query.to);
    if (fromIndex < 0 || toIndex <= fromIndex) return;

    direct = train.direct;
    const stationByCode = new Map(train.stations.map((station) => [station.code, station]));
    const indexByCode = new Map(train.stations.map((station, index) => [station.code, index]));
    const inventory = train.inventory.filter((leg) => leg.travelClass === query.travelClass);
    const maxLegs = query.maxChanges + 1;

    const walk = (currentCode: string, path: JourneyLeg[]) => {
      const currentIndex = indexByCode.get(currentCode) ?? -1;
      if (currentCode === query.to) {
        const solution = buildSolution(train, path, query);
        if (solution) solutions.push(solution);
        return;
      }
      if (path.length >= maxLegs) return;

      inventory.forEach((leg) => {
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

  return { direct, solutions: unique.slice(0, 4) };
}
