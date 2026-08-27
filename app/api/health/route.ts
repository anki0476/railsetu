import { JOURNEY_ENGINE_LIMITS } from '../../lib/journey-engine';

export function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'railsetu',
      checks: {
        routeEngine: 'ready',
        ticketRenderer: 'ready',
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
