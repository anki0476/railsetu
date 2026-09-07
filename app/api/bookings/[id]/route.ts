import { ApiRequestError, apiError, secureJson } from '../../../lib/api-security';
import { database, sessionFromRequest, type StoredItinerary } from '../../../lib/reservation-store';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^book_[a-f0-9]{32}$/.test(id)) throw new ApiRequestError(400, 'Invalid booking.');
    const token = new URL(request.url).searchParams.get('token');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiRequestError(400, 'Invalid ticket token.');
    const row = await database().prepare(`SELECT b.id,b.state,b.pnr,b.ticket_token,p.method,o.itinerary_json
      FROM bookings b JOIN reservations r ON r.id=b.reservation_id JOIN inventory_offers o ON o.id=r.offer_id
      JOIN payments p ON p.reservation_id=r.id WHERE b.id=?1 AND b.ticket_token=?2 AND r.session_id=?3 AND b.state='TICKET_ISSUED'`)
      .bind(id, token, sessionFromRequest(request)).first<{ id: string; state: string; pnr: string; ticket_token: string; method: string; itinerary_json: string }>();
    if (!row) return secureJson({ error: { code: 'TICKET_NOT_ISSUED', message: 'This ticket is not available.' } }, { status: 404 });
    return secureJson({ bookingId: row.id, state: row.state, pnr: row.pnr, ticketToken: row.ticket_token, method: row.method, itinerary: JSON.parse(row.itinerary_json) as StoredItinerary });
  } catch (error) { return apiError(error, 'Booking details are unavailable.'); }
}
