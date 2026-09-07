import { ApiRequestError, apiError, requireSameOrigin, secureJson } from '../../../lib/api-security';
import { database, expireReservation, readReservation, reservationPayload, sessionFromRequest } from '../../../lib/reservation-store';

function validId(value: string) { return /^res_[a-f0-9]{32}$/.test(value); }

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!validId(id)) throw new ApiRequestError(400, 'Invalid reservation.');
    const record = await readReservation(id, sessionFromRequest(request));
    if (!record) return secureJson({ error: { code: 'RESERVATION_NOT_FOUND' } }, { status: 404 });
    return secureJson(reservationPayload(await expireReservation(record)));
  } catch (error) { return apiError(error, 'Reservation status is unavailable.'); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    if (!validId(id)) throw new ApiRequestError(400, 'Invalid reservation.');
    const sessionId = sessionFromRequest(request);
    const record = await readReservation(id, sessionId);
    if (!record) return secureJson({ released: true });
    const now = Date.now();
    await database().batch([
      database().prepare(`UPDATE reservations SET state='RELEASED',updated_at=?1 WHERE id=?2 AND session_id=?3 AND state='HELD'`).bind(now, id, sessionId),
      database().prepare(`UPDATE inventory_offers SET active_reservation_id=NULL,held_until=NULL WHERE id=?1 AND active_reservation_id=?2`).bind(record.offer_id, id),
    ]);
    return secureJson({ released: true });
  } catch (error) { return apiError(error, 'Reservation could not be released.'); }
}
