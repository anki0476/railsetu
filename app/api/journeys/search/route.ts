import { activeJourneyInventoryProvider } from '../../../lib/active-journey-inventory';
import { findJourneyRecommendations, solveJourneyFromInventory, type JourneyOutcome } from '../../../lib/journey-engine';
import {
  JOURNEY_REQUEST_LIMIT_BYTES,
  JourneyRequestError,
  journeyCacheKey,
  parseJourneyRequest,
} from '../../../lib/journey-request';

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 250;
const cache = new Map<string, { expiresAt: number; outcome: JourneyOutcome }>();

function json(body: unknown, status: number, requestId: string, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
      ...extraHeaders,
    },
  });
}

function getCached(key: string, now: number) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  // Refresh insertion order so frequently used searches survive bounded LRU eviction.
  cache.delete(key);
  cache.set(key, entry);
  return entry.outcome;
}

function setCached(key: string, outcome: JourneyOutcome, now: number) {
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, outcome });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    return json({ error: { code: 'unsupported_media_type', message: 'Send a JSON request body.' } }, 415, requestId);
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > JOURNEY_REQUEST_LIMIT_BYTES) {
    return json({ error: { code: 'request_too_large', message: 'Journey request is too large.' } }, 413, requestId);
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > JOURNEY_REQUEST_LIMIT_BYTES) {
      return json({ error: { code: 'request_too_large', message: 'Journey request is too large.' } }, 413, requestId);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } }, 400, requestId);
    }

    const query = parseJourneyRequest(parsed);
    const key = `${activeJourneyInventoryProvider.id}@${activeJourneyInventoryProvider.version}|${journeyCacheKey(query)}`;
    const now = Date.now();
    let outcome = getCached(key, now);
    const cacheStatus = outcome ? 'HIT' : 'MISS';
    if (!outcome) {
      const inventory = await activeJourneyInventoryProvider.getInventory(query);
      outcome = solveJourneyFromInventory(query, inventory);
      if (!outcome.solutions.length) {
        outcome.recommendations = await findJourneyRecommendations(query, activeJourneyInventoryProvider);
      }
      setCached(key, outcome, now);
    }

    const duration = Math.max(0, performance.now() - startedAt).toFixed(1);
    return json(
      { outcome },
      200,
      requestId,
      {
        'Server-Timing': `journey;dur=${duration}`,
        'X-RailSetu-Cache': cacheStatus,
      },
    );
  } catch (error) {
    if (error instanceof JourneyRequestError) {
      return json({ error: { code: error.code, message: error.message } }, 400, requestId);
    }
    console.error('[journey-search]', { requestId, error: error instanceof Error ? error.message : 'unknown' });
    return json({ error: { code: 'internal_error', message: 'Journey search is temporarily unavailable.' } }, 500, requestId);
  }
}

export function GET() {
  return new Response(null, {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
}
