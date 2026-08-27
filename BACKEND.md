# RailSetu backend architecture

RailSetu's prototype backend is designed as a stateless service running on the
Sites Cloudflare Worker runtime. Stateless request handling lets the platform
add isolates horizontally when concurrent traffic rises; no search request
depends on the memory or session of a previous request.

## Request path

1. `POST /api/journeys/search` accepts only a small JSON contract.
2. The contract is normalised and validated against supported stations,
   classes, traveller profiles and preferences.
3. A bounded route engine searches representative inventory. Per-request path
   expansions, seat changes, candidates and returned results all have hard
   limits, preventing accidental combinatorial work as inventory grows.
4. Identical searches use a short-lived, bounded LRU cache inside each warm
   isolate. This reduces repeated computation without storing traveller data.
5. The browser receives only the journey outcome required by the current UI.

The planner retains a local deterministic fallback. A temporary network or
service failure therefore does not strand a user on a slow mobile connection,
while normal traffic still exercises the backend boundary.

## Operational safeguards

- Request bodies and ticket URLs are size-limited.
- Inputs are allowlisted, clamped and escaped before computation or rendering.
- Search work is CPU-bounded and the cache is memory-bounded.
- Responses include request IDs and server timing for production diagnosis.
- Errors return stable public codes without exposing internal details.
- Ticket downloads use restrictive browser security headers and never cache.
- `/api/health` exposes a lightweight readiness contract for uptime checks.

## Mobile and slower connections

Search requests contain only compact codes and preference values. Responses
contain no images or page markup, can be compressed at the edge, and the client
has a seven-second ceiling before falling back locally. Existing responsive UI
and behaviour remain unchanged.

## Live-data phase

The current inventory is representative. A production railway-availability
adapter should preserve the same validated API contract and add provider
timeouts, retry budgets, circuit breaking and reservation-lock expiry. Capacity
claims should then be confirmed with staged load tests against the selected
provider limits; architecture alone is not a substitute for measured results.
