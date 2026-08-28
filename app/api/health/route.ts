import { JOURNEY_ENGINE_LIMITS } from '../../lib/journey-engine';
import { activeJourneyInventoryProvider } from '../../lib/active-journey-inventory';

export function GET() {
  const inventoryDiagnostics = activeJourneyInventoryProvider.diagnostics?.();
  return Response.json(
    {
      status: 'ok',
      service: 'railsetu',
      checks: {
        routeEngine: 'ready',
        inventoryProvider: 'ready',
        ticketRenderer: 'ready',
      },
      inventory: {
        provider: activeJourneyInventoryProvider.id,
        version: activeJourneyInventoryProvider.version,
        stations: inventoryDiagnostics?.stationCount ?? activeJourneyInventoryProvider.listStations().length,
        services: inventoryDiagnostics?.serviceCount,
        connectedStationPairs: inventoryDiagnostics?.connectedPairs,
        pairCoveragePercent: inventoryDiagnostics?.pairCoveragePercent,
      },
      limits: {
        maxPathExpansions: JOURNEY_ENGINE_LIMITS.maxPathExpansions,
        maxReturnedSolutions: JOURNEY_ENGINE_LIMITS.maxReturnedSolutions,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
