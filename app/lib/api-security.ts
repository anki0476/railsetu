const buckets = new Map<string, { count: number; resetsAt: number }>();
const MAX_BUCKETS = 2_000;

export class ApiRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export const API_SECURITY_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function secureJson(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { ...API_SECURITY_HEADERS, ...init.headers },
  });
}

function clientIdentifier(request: Request) {
  return (
    request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]
    ?? 'anonymous'
  ).trim().slice(0, 80);
}

/** Blocks browser cross-site requests before they can spend provider credits. */
export function requireSameOrigin(request: Request) {
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') throw new ApiRequestError(403, 'Cross-site requests are not allowed.');
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) throw new Error('origin mismatch');
    } catch {
      throw new ApiRequestError(403, 'Cross-site requests are not allowed.');
    }
  }
}

export function enforceRateLimit(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const key = `${scope}:${clientIdentifier(request)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetsAt <= now) bucket = { count: 0, resetsAt: now + windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > MAX_BUCKETS) {
    for (const [candidate, value] of buckets) {
      if (value.resetsAt <= now || buckets.size > MAX_BUCKETS) buckets.delete(candidate);
      if (buckets.size <= MAX_BUCKETS) break;
    }
  }

  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetsAt - now) / 1_000));
    return secureJson({ error: 'Too many requests. Please try again shortly.' }, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }
  return null;
}

export function rejectOversizedRequest(request: Request, maximumBytes: number) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ApiRequestError(413, 'Request is too large.');
  }
}

export async function readJsonBody(request: Request, maximumBytes: number) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiRequestError(415, 'Send a JSON request body.');
  }
  rejectOversizedRequest(request, maximumBytes);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) throw new ApiRequestError(413, 'Request is too large.');
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiRequestError(400, 'Request body is not valid JSON.');
  }
}

export function apiError(error: unknown, fallback = 'Request could not be completed.') {
  if (error instanceof ApiRequestError) return secureJson({ error: error.message }, { status: error.status });
  return secureJson({ error: fallback }, { status: 502 });
}
