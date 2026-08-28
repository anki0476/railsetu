import type {
  BerthCode,
  InventoryLegRecord,
  InventorySearchContext,
  JourneyInventoryProvider,
  JourneyInventorySnapshot,
  ScheduledStation,
  StationOption,
  TrainInventoryRecord,
  TravelClass,
} from './journey-inventory-provider';

type StationDefinition = StationOption & { latitude: number; longitude: number };

type ServiceBlueprint = {
  numbers: readonly [outbound: string, inbound: string];
  name: string;
  route: readonly string[];
  departures: readonly [outbound: string, inbound: string];
  classes: readonly TravelClass[];
  explicitTimes?: Readonly<Record<string, readonly string[]>>;
  durationOverride?: Readonly<Record<string, string>>;
};

const ALL_CLASSES = ['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC'] as const satisfies readonly TravelClass[];
const OVERNIGHT_CLASSES = ['1A', '2A', '3A', '3E', 'SL'] as const satisfies readonly TravelClass[];
const EXPRESS_CLASSES = ['2A', '3A', '3E', 'SL'] as const satisfies readonly TravelClass[];
const MIXED_CLASSES = ['2A', '3A', '3E', 'SL', 'CC'] as const satisfies readonly TravelClass[];

const stationDefinitions: readonly StationDefinition[] = [
  { code: 'NDLS', name: 'New Delhi', latitude: 28.6429, longitude: 77.2195 },
  { code: 'ALJN', name: 'Aligarh Junction', latitude: 27.8899, longitude: 78.0748 },
  { code: 'CNB', name: 'Kanpur Junction', latitude: 26.4547, longitude: 80.3519 },
  { code: 'PRYJ', name: 'Prayagraj Junction', latitude: 25.4358, longitude: 81.8463 },
  { code: 'PNBE', name: 'Patna Junction', latitude: 25.6027, longitude: 85.1373 },
  { code: 'HWH', name: 'Howrah Junction', latitude: 22.5839, longitude: 88.3428 },
  { code: 'REWA', name: 'Rewa', latitude: 24.5362, longitude: 81.3042 },
  { code: 'BPL', name: 'Bhopal Junction', latitude: 23.2685, longitude: 77.4139 },
  { code: 'BTC', name: 'Balaghat Junction', latitude: 21.8129, longitude: 80.1838 },
  { code: 'NGP', name: 'Nagpur Junction', latitude: 21.1539, longitude: 79.0882 },
  { code: 'RJN', name: 'Rajnandgaon', latitude: 21.0972, longitude: 81.0302 },
  { code: 'DURG', name: 'Durg Junction', latitude: 21.1907, longitude: 81.2849 },
  { code: 'R', name: 'Raipur Junction', latitude: 21.2560, longitude: 81.6296 },
  { code: 'CSMT', name: 'Mumbai CSMT', latitude: 18.9398, longitude: 72.8355 },
  { code: 'BRC', name: 'Vadodara Junction', latitude: 22.3107, longitude: 73.1812 },
  { code: 'BHUJ', name: 'Bhuj', latitude: 23.2530, longitude: 69.6693 },
  { code: 'PUNE', name: 'Pune Junction', latitude: 18.5289, longitude: 73.8744 },
  { code: 'SUR', name: 'Solapur', latitude: 17.6649, longitude: 75.8930 },
  { code: 'KLBG', name: 'Kalaburagi', latitude: 17.3297, longitude: 76.8343 },
  { code: 'WADI', name: 'Wadi Junction', latitude: 17.0513, longitude: 76.9905 },
  { code: 'HYB', name: 'Hyderabad Deccan', latitude: 17.3924, longitude: 78.4674 },
  { code: 'BZA', name: 'Vijayawada Junction', latitude: 16.5184, longitude: 80.6193 },
  { code: 'PURI', name: 'Puri', latitude: 19.8076, longitude: 85.8352 },
  { code: 'MAS', name: 'MGR Chennai Central', latitude: 13.0822, longitude: 80.2755 },
  { code: 'KPD', name: 'Katpadi Junction', latitude: 12.9723, longitude: 79.1384 },
  { code: 'JTJ', name: 'Jolarpettai Junction', latitude: 12.5700, longitude: 78.5744 },
  { code: 'KJM', name: 'Krishnarajapuram', latitude: 13.0007, longitude: 77.6758 },
  { code: 'SBC', name: 'KSR Bengaluru', latitude: 12.9784, longitude: 77.5720 },
  { code: 'JAT', name: 'Jammu Tawi', latitude: 32.7069, longitude: 74.8806 },
];

const services: readonly ServiceBlueprint[] = [
  {
    numbers: ['12310', '12309'], name: 'Magadh Express', route: ['NDLS', 'ALJN', 'CNB', 'PRYJ', 'PNBE'],
    departures: ['20:10', '17:10'], classes: OVERNIGHT_CLASSES,
    explicitTimes: {
      '12310': ['20:10', '21:48', '01:05', '03:25', '09:40'],
      '12309': ['17:10', '22:55', '01:15', '04:32', '06:10'],
    },
    durationOverride: { '12310': '13h 30m', '12309': '13h 00m' },
  },
  { numbers: ['12702', '12701'], name: 'Hussainsagar Express', route: ['PUNE', 'SUR', 'KLBG', 'WADI', 'HYB'], departures: ['18:35', '14:40'], classes: OVERNIGHT_CLASSES },
  { numbers: ['12657', '12658'], name: 'Chennai Mail', route: ['MAS', 'KPD', 'JTJ', 'KJM', 'SBC'], departures: ['22:50', '22:40'], classes: MIXED_CLASSES },
  { numbers: ['12628', '12627'], name: 'Karnataka Express', route: ['NDLS', 'BPL', 'NGP', 'HYB', 'WADI', 'SBC'], departures: ['20:20', '19:20'], classes: OVERNIGHT_CLASSES },
  { numbers: ['11019', '11020'], name: 'Konark Express', route: ['CSMT', 'PUNE', 'SUR', 'WADI', 'HYB', 'BZA', 'MAS'], departures: ['14:00', '12:10'], classes: EXPRESS_CLASSES },
  { numbers: ['12295', '12296'], name: 'Sanghamitra Express', route: ['PNBE', 'PRYJ', 'BPL', 'NGP', 'HYB', 'BZA', 'MAS', 'SBC'], departures: ['20:15', '09:10'], classes: OVERNIGHT_CLASSES },
  { numbers: ['12303', '12304'], name: 'Poorva Express', route: ['NDLS', 'CNB', 'PRYJ', 'PNBE', 'HWH'], departures: ['17:40', '08:15'], classes: OVERNIGHT_CLASSES },
  { numbers: ['12841', '12842'], name: 'Coromandel Express', route: ['HWH', 'BZA', 'MAS'], departures: ['15:20', '07:00'], classes: OVERNIGHT_CLASSES },
  { numbers: ['12723', '12724'], name: 'Telangana Express', route: ['HYB', 'NGP', 'BPL', 'NDLS'], departures: ['06:25', '16:00'], classes: OVERNIGHT_CLASSES },
  { numbers: ['12615', '12616'], name: 'Grand Trunk Express', route: ['MAS', 'BZA', 'HYB', 'NGP', 'BPL', 'NDLS'], departures: ['19:15', '16:10'], classes: OVERNIGHT_CLASSES },
  { numbers: ['12321', '12322'], name: 'Mumbai Mail', route: ['CSMT', 'NGP', 'HWH'], departures: ['22:15', '23:35'], classes: OVERNIGHT_CLASSES },
  { numbers: ['12437', '12438'], name: 'Secunderabad Rajdhani', route: ['ALJN', 'NDLS', 'BPL', 'NGP', 'HYB', 'WADI', 'KLBG', 'SUR', 'PUNE', 'CSMT'], departures: ['15:05', '19:35'], classes: ['1A', '2A', '3A'] },
  { numbers: ['12577', '12578'], name: 'Bagmati Express', route: ['KPD', 'JTJ', 'KJM', 'SBC', 'WADI', 'HYB', 'NGP', 'BPL', 'CNB', 'PRYJ', 'PNBE', 'HWH'], departures: ['05:40', '07:15'], classes: EXPRESS_CLASSES },
  { numbers: ['12647', '12648'], name: 'Kongu Express', route: ['HWH', 'PNBE', 'PRYJ', 'BPL', 'NGP', 'BZA', 'MAS', 'KPD', 'JTJ', 'SBC'], departures: ['11:30', '23:45'], classes: ALL_CLASSES },
  { numbers: ['12549', '12550'], name: 'Durg Jammu Tawi Express', route: ['DURG', 'R', 'NGP', 'BPL', 'NDLS', 'JAT'], departures: ['12:15', '04:35'], classes: OVERNIGHT_CLASSES },
  { numbers: ['18237', '18238'], name: 'Chhattisgarh Express', route: ['RJN', 'DURG', 'R', 'NGP', 'BPL', 'NDLS'], departures: ['15:35', '04:25'], classes: EXPRESS_CLASSES },
  { numbers: ['11703', '11704'], name: 'Rewa Itwari Express', route: ['REWA', 'BPL', 'BTC', 'NGP'], departures: ['17:20', '18:30'], classes: EXPRESS_CLASSES },
  { numbers: ['22955', '22956'], name: 'Kutch Express', route: ['CSMT', 'BRC', 'BHUJ'], departures: ['17:45', '20:15'], classes: OVERNIGHT_CLASSES },
  { numbers: ['12843', '12844'], name: 'Puri Ahmedabad Express', route: ['PURI', 'R', 'DURG', 'NGP', 'BPL', 'BRC'], departures: ['17:30', '18:40'], classes: OVERNIGHT_CLASSES },
];

const stationByCode = new Map(stationDefinitions.map((station) => [station.code, station]));

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function clock(totalMinutes: number) {
  const value = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function radians(value: number) {
  return value * Math.PI / 180;
}

function distanceKm(firstCode: string, secondCode: string) {
  const first = stationByCode.get(firstCode);
  const second = stationByCode.get(secondCode);
  if (!first || !second) return 100;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const latitudeA = radians(first.latitude);
  const latitudeB = radians(second.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function segmentMinutes(first: string, second: string) {
  const railDistance = distanceKm(first, second) * 1.14;
  return Math.max(35, Math.round((railDistance / 58 * 60 + 18) / 5) * 5);
}

function serviceSchedule(service: ServiceBlueprint, number: string, route: readonly string[], departure: string) {
  const explicit = service.explicitTimes?.[number];
  if (explicit?.length === route.length) return [...explicit];
  const times = [departure];
  let current = minutes(departure);
  for (let index = 1; index < route.length; index += 1) {
    current += segmentMinutes(route[index - 1], route[index]);
    times.push(clock(current));
  }
  return times;
}

function scheduleForDirection(service: ServiceBlueprint, direction: 0 | 1) {
  const route = direction === 0 ? [...service.route] : [...service.route].reverse();
  const number = service.numbers[direction];
  const times = serviceSchedule(service, number, route, service.departures[direction]);
  const stations = route.map((code, index): ScheduledStation => {
    const station = stationByCode.get(code);
    if (!station) throw new Error(`Unknown mock station ${code}.`);
    return { code, name: station.name, time: times[index] };
  });
  const computedDuration = route.slice(1).reduce((total, code, index) => total + segmentMinutes(route[index], code), 0);
  const duration = service.durationOverride?.[number]
    ?? `${Math.floor(computedDuration / 60)}h ${String(computedDuration % 60).padStart(2, '0')}m`;
  return { number, route, stations, duration };
}

const classRates: Readonly<Record<TravelClass, { perKm: number; base: number }>> = {
  '1A': { perKm: 2.8, base: 650 },
  '2A': { perKm: 1.75, base: 400 },
  '3A': { perKm: 1.25, base: 250 },
  '3E': { perKm: 1.05, base: 210 },
  'SL': { perKm: 0.65, base: 120 },
  'CC': { perKm: 0.9, base: 200 },
  'EC': { perKm: 1.8, base: 450 },
};

function fareFor(from: string, to: string, travelClass: TravelClass) {
  const railDistance = distanceKm(from, to) * 1.14;
  const rate = classRates[travelClass];
  return Math.max(140, Math.round((rate.base + railDistance * rate.perKm) / 5) * 5);
}

function splitIndices(fromIndex: number, toIndex: number, changes: number, seed: number) {
  if (changes <= 0) return [fromIndex, toIndex];
  const interior = Array.from({ length: toIndex - fromIndex - 1 }, (_, index) => fromIndex + index + 1);
  const selected: number[] = [];
  let state = seed;
  while (selected.length < changes && interior.length) {
    state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0;
    const candidate = interior.splice(state % interior.length, 1)[0];
    selected.push(candidate);
  }
  return [fromIndex, ...selected.sort((a, b) => a - b), toIndex];
}

function coachPrefix(travelClass: TravelClass) {
  return ({ '1A': 'H', '2A': 'A', '3A': 'B', '3E': 'M', 'SL': 'S', 'CC': 'C', 'EC': 'E' } as const)[travelClass];
}

function berthFor(travelClass: TravelClass, seed: number): BerthCode {
  if (travelClass === 'CC' || travelClass === 'EC') return seed % 3 === 0 ? 'WS' : 'AS';
  const berths = ['LB', 'MB', 'UB', 'SL'] as const;
  return berths[seed % berths.length];
}

function generatedChain(
  number: string,
  route: readonly string[],
  fromIndex: number,
  toIndex: number,
  travelClass: TravelClass,
  directFare: number,
  variant: number,
) {
  const seed = hash(`${number}|${route[fromIndex]}|${route[toIndex]}|${travelClass}|${variant}`);
  const interiorCount = Math.max(0, toIndex - fromIndex - 1);
  const changeRoll = seed % 100;
  const requestedChanges = interiorCount === 0 ? 0 : changeRoll < 48 ? 1 : changeRoll < 80 ? 2 : 3;
  const changes = Math.min(interiorCount, requestedChanges);
  const points = splitIndices(fromIndex, toIndex, changes, seed);
  const totalDistance = points.slice(1).reduce((total, point, index) => total + distanceKm(route[points[index]], route[point]), 0);
  const targetFare = Math.round((directFare * (96 + ((seed >>> 9) % 9)) / 100) / 5) * 5;
  const coachMode = (seed >>> 5) % 100;
  const baseCoach = 1 + ((seed >>> 13) % 5);
  let allocatedFare = 0;

  return points.slice(1).map((point, index): InventoryLegRecord => {
    const start = points[index];
    const legDistance = distanceKm(route[start], route[point]);
    const isLast = index === points.length - 2;
    const proportionalFare = Math.round((targetFare * legDistance / Math.max(1, totalDistance)) / 5) * 5;
    const fare = isLast ? Math.max(80, targetFare - allocatedFare) : Math.max(80, proportionalFare);
    allocatedFare += fare;
    const coachOffset = index === 0 || coachMode < 46 ? 0 : coachMode < 82 ? Math.min(index, 2) : index * 3;
    const legSeed = hash(`${seed}|${index}`);
    return {
      id: `${number}-${travelClass.toLowerCase()}-${fromIndex}-${toIndex}-${variant}-${index}`,
      from: route[start],
      to: route[point],
      coach: `${coachPrefix(travelClass)}${baseCoach + coachOffset}`,
      seat: String(1 + (legSeed % (travelClass === '1A' ? 24 : 64))),
      berth: berthFor(travelClass, legSeed >>> 4),
      fare,
      travelClass,
    };
  });
}

function pinnedMagadhChain(context: InventorySearchContext): InventoryLegRecord[] | null {
  if (context.from !== 'NDLS' || context.to !== 'PNBE' || context.travelClass !== '3A') return null;
  return [
    { id: 'mag-cnb-1', from: 'NDLS', to: 'CNB', coach: 'B2', seat: '34', berth: 'LB', fare: 735, travelClass: '3A' },
    { id: 'mag-cnb-2', from: 'CNB', to: 'PNBE', coach: 'B2', seat: '41', berth: 'SL', fare: 705, travelClass: '3A' },
  ];
}

function trainForQuery(service: ServiceBlueprint, direction: 0 | 1, context: InventorySearchContext): TrainInventoryRecord | null {
  if (!service.classes.includes(context.travelClass as TravelClass)) return null;
  const scheduled = scheduleForDirection(service, direction);
  const fromIndex = scheduled.route.indexOf(context.from);
  const toIndex = scheduled.route.indexOf(context.to);
  if (fromIndex < 0 || toIndex <= fromIndex) return null;

  const travelClass = context.travelClass as TravelClass;
  const pinned = scheduled.number === '12310' ? pinnedMagadhChain(context) : null;
  const directFare = pinned ? 1450 : fareFor(context.from, context.to, travelClass);
  const waitlist = pinned ? 46 : 8 + (hash(`${scheduled.number}|${context.from}|${context.to}|${travelClass}`) % 51);
  const inventory = pinned
    ? pinned
    : [0, 1].flatMap((variant) => generatedChain(
      scheduled.number,
      scheduled.route,
      fromIndex,
      toIndex,
      travelClass,
      directFare,
      variant,
    ));

  return {
    number: scheduled.number,
    name: service.name,
    duration: scheduled.duration,
    stations: scheduled.stations,
    direct: { label: `WL ${waitlist}`, fare: directFare },
    inventory,
  };
}

function getMockInventory(context: InventorySearchContext): JourneyInventorySnapshot {
  const trains = services.flatMap((service) => ([0, 1] as const)
    .map((direction) => trainForQuery(service, direction, context))
    .filter((train): train is TrainInventoryRecord => Boolean(train)));
  return { providerId: mockJourneyInventoryProvider.id, version: mockJourneyInventoryProvider.version, trains };
}

export const mockInventoryCoverage = (() => {
  const pairs = new Set<string>();
  services.forEach((service) => {
    for (let first = 0; first < service.route.length; first += 1) {
      for (let second = first + 1; second < service.route.length; second += 1) {
        pairs.add([service.route[first], service.route[second]].sort().join('|'));
      }
    }
  });
  const stationCount = stationDefinitions.length;
  const totalPairs = stationCount * (stationCount - 1) / 2;
  return Object.freeze({ stationCount, serviceCount: services.length * 2, connectedPairs: pairs.size, totalPairs, ratio: pairs.size / totalPairs });
})();

export const mockJourneyInventoryProvider: JourneyInventoryProvider = Object.freeze({
  id: 'railsetu-representative-india',
  version: '2026.08.28.1',
  listStations: () => stationDefinitions.map(({ code, name }) => ({ code, name })),
  getInventory: getMockInventory,
  diagnostics: () => ({
    stationCount: mockInventoryCoverage.stationCount,
    serviceCount: mockInventoryCoverage.serviceCount,
    connectedPairs: mockInventoryCoverage.connectedPairs,
    totalPairs: mockInventoryCoverage.totalPairs,
    pairCoveragePercent: Math.round(mockInventoryCoverage.ratio * 1000) / 10,
  }),
});
