# RailSetu backend architecture

RailSetu's prototype backend is designed as a stateless service running on the
Sites Cloudflare Worker runtime. Stateless request handling lets the platform
add isolates horizontally when concurrent traffic rises; no search request
depends on the memory or session of a previous request.

## Request path

1. `POST /api/journeys/search` accepts only a small JSON contract.
2. The contract is normalised and validated against supported stations,
   classes, traveller profiles and preferences.
3. The active inventory provider supplies only trains relevant to that search.
   The representative provider deterministically generates realistic schedules,
   fares, waitlists, seat allocations and one-to-three transitions across 20
   stations and 26 directional services. It currently connects 142 of 190
   station pairs (74.7%).
4. A bounded route engine searches that provider snapshot. Per-request path
   expansions, seat changes, candidates and returned results all have hard
   limits, preventing accidental combinatorial work as inventory grows.
5. Identical searches use a short-lived, bounded LRU cache inside each warm
   isolate. This reduces repeated computation without storing traveller data.
6. The browser receives only the journey outcome required by the current UI.

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

## Replaceable inventory provider

The planner and solver depend on the `JourneyInventoryProvider` contract rather
than the representative dataset. The active provider is selected in one module
and may return data synchronously or asynchronously. Replacing it with an
authorised HTTP or managed-database adapter preserves the validated search
request, cache, solver, comfort-score, ticket, and UI contracts.

Mock values are deterministic for the same train, station pair and class. This
makes demos and tests repeatable while still producing varied seat and coach
changes. Inventory is generated per query instead of materialising every seat
combination in the browser or Worker, keeping startup memory and mobile bundles
bounded.

## Live-data phase

The current inventory is representative. A production railway-availability
adapter only needs to implement the provider contract and add provider timeouts,
retry budgets, circuit breaking and reservation-lock expiry. Capacity
claims should then be confirmed with staged load tests against the selected
provider limits; architecture alone is not a substitute for measured results.
