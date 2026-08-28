export type TravelClass = '1A' | '2A' | '3A' | '3E' | 'SL' | 'CC' | 'EC';

export type BerthCode = 'LB' | 'MB' | 'UB' | 'SL' | 'WS' | 'AS';

export type StationOption = {
  code: string;
  name: string;
};

export type ScheduledStation = StationOption & {
  time: string;
};

export type InventorySearchContext = {
  from: string;
  to: string;
  travelClass: string;
};

export type InventoryLegRecord = {
  id: string;
  from: string;
  to: string;
  coach: string;
  seat: string;
  berth: BerthCode;
  fare: number;
  travelClass: string;
};

export type TrainInventoryRecord = {
  number: string;
  name: string;
  duration: string;
  stations: ScheduledStation[];
  direct: { label: string; fare: number } | null;
  inventory: InventoryLegRecord[];
};

export type JourneyInventorySnapshot = {
  providerId: string;
  version: string;
  trains: TrainInventoryRecord[];
};

export type InventoryProviderDiagnostics = {
  stationCount: number;
  serviceCount?: number;
  connectedPairs?: number;
  totalPairs?: number;
  pairCoveragePercent?: number;
};

/**
 * Adapter boundary for RailSetu inventory. A production adapter can replace the
 * mock provider without changing the route solver, API response, or planner UI.
 * The provider may perform an HTTP request, read a managed datastore, or return
 * an in-memory snapshot.
 */
export interface JourneyInventoryProvider {
  readonly id: string;
  readonly version: string;
  listStations(): readonly StationOption[];
  getInventory(context: InventorySearchContext): JourneyInventorySnapshot | Promise<JourneyInventorySnapshot>;
  diagnostics?(): InventoryProviderDiagnostics;
}
