import { activeJourneyInventoryProvider } from '../../lib/active-journey-inventory';
import { solveJourneyFromInventory } from '../../lib/journey-engine';
import { parseJourneyRequest } from '../../lib/journey-request';
import { ApiRequestError, apiError, enforceRateLimit, readJsonBody, requireSameOrigin, secureJson } from '../../lib/api-security';
import { database, HOLD_TTL_MS, IDEMPOTENCY_TTL_MS, readReservation, reservationPayload, sessionCookie, sessionFromRequest, sha256, type StoredItinerary } from '../../lib/reservation-store';

const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const limited = enforceRateLimit(request, 'reservation-create', 30);
    if (limited) return limited;
    const body = await readJsonBody(request, MAX_BODY_BYTES) as { query?: unknown; date?: unknown; solutionId?: unknown; idempotencyKey?: unknown };
    if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new ApiRequestError(400, 'A valid journey date is required.');
    if (typeof body.solutionId !== 'string' || body.solutionId.length > 180) throw new ApiRequestError(400, 'A valid journey offer is required.');
    if (typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(body.idempotencyKey)) throw new ApiRequestError(400, 'A valid idempotency key is required.');
    const query = parseJourneyRequest({ query: body.query });
    const inventory = await activeJourneyInventoryProvider.getInventory(query);
    const outcome = solveJourneyFromInventory(query, inventory);
    const solution = outcome.solutions.find((candidate) => candidate.id === body.solutionId);
    if (!solution) return secureJson({ error: { code: 'OFFER_UNAVAILABLE', message: 'That journey is no longer available.' } }, { status: 409 });

    const sessionId = sessionFromRequest(request);
    const now = Date.now();
    const expiresAt = now + HOLD_TTL_MS;
    const reservationId = `res_${(await sha256(`${sessionId}|${body.idempotencyKey}`)).slice(0, 32)}`;
    const offerId = `off_${(await sha256(`${activeJourneyInventoryProvider.version}|${body.date}|${solution.id}`)).slice(0, 32)}`;
    const itinerary: StoredItinerary = {
      fare: solution.fare,
      train: `${solution.trainNumber} · ${solution.trainName}`,
      from: query.from,
      fromName: solution.legs[0].from.name,
      to: query.to,
      toName: solution.legs.at(-1)?.to.name ?? query.to,
      date: body.date,
      travelClass: query.travelClass,
      comfort: solution.comfort,
      profile: query.profile,
      party: solution.passengerJourneys.map((journey) => journey.passenger.name).join('|'),
      passengerCount: solution.passengerJourneys.length,
      legs: solution.legs.map((leg) => [leg.from.code,leg.from.time,leg.to.code,leg.to.time,leg.coach,leg.seat,leg.berth].join('~')).join('|'),
    };
    const itineraryJson = JSON.stringify(itinerary);
    const itineraryHash = await sha256(itineraryJson);
    const db = database();
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO inventory_offers(id,inventory_version,itinerary_json,fare,created_at) VALUES(?1,?2,?3,?4,?5)`).bind(offerId, activeJourneyInventoryProvider.version, itineraryJson, solution.fare, now),
      db.prepare(`UPDATE inventory_offers SET active_reservation_id=?1,held_until=?2 WHERE id=?3 AND (active_reservation_id IS NULL OR held_until<=?4 OR active_reservation_id=?1)`).bind(reservationId, expiresAt, offerId, now),
      db.prepare(`INSERT OR IGNORE INTO reservations(id,offer_id,session_id,state,expires_at,itinerary_hash,created_at,updated_at)
        SELECT ?1,?2,?3,'HELD',?4,?5,?6,?6 FROM inventory_offers WHERE id=?2 AND active_reservation_id=?1`).bind(reservationId, offerId, sessionId, expiresAt, itineraryHash, now),
      db.prepare(`INSERT OR IGNORE INTO idempotency_keys(key,operation,response_json,expires_at) VALUES(?1,'reserve',?2,?3)`).bind(`${sessionId}:reserve:${body.idempotencyKey}`, reservationId, now + IDEMPOTENCY_TTL_MS),
    ]);
    const record = await readReservation(reservationId, sessionId);
    if (!record) return secureJson({ error: { code: 'OFFER_UNAVAILABLE', message: 'Another passenger just reserved this journey. Please choose an updated option.' } }, { status: 409 });
    return secureJson(reservationPayload(record), { status: 201, headers: { 'Set-Cookie': sessionCookie(sessionId) } });
  } catch (error) {
    return apiError(error, 'The journey could not be reserved.');
  }
}
