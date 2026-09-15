import { waitUntil } from 'cloudflare:workers';
import { ApiRequestError, apiError, readJsonBody, requireSameOrigin, secureJson } from '../../../lib/api-security';
import { simulatedPaymentProvider } from '../../../lib/booking-providers';
import { deliverPendingWhatsAppEvents } from '../../../lib/native-whatsapp-service';
import { database, sessionFromRequest, sha256 } from '../../../lib/reservation-store';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const body = await readJsonBody(request, 2_048) as { token?: unknown };
    if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) throw new ApiRequestError(400, 'Invalid cancellation request.');
    const tokenHash = await sha256(body.token);
    const principalId = sessionFromRequest(request);
    const now = Date.now();
    const action = await database().prepare(`SELECT reservation_id FROM checkout_sessions WHERE token_hash=?1 AND principal_id=?2 AND operation='cancellation' AND state='PREPARED' AND consumed_at IS NULL AND expires_at>?3`)
      .bind(tokenHash, principalId, now).first<{ reservation_id:string }>();
    if (!action) throw new ApiRequestError(410, 'This cancellation confirmation has expired or was already used.');
    const row = await database().prepare(`SELECT b.id booking_id,b.state,p.id payment_id,p.provider_reference,p.amount,p.method,o.itinerary_json FROM bookings b JOIN reservations r ON r.id=b.reservation_id JOIN inventory_offers o ON o.id=r.offer_id LEFT JOIN payments p ON p.reservation_id=r.id WHERE r.id=?1 AND r.session_id=?2`)
      .bind(action.reservation_id, principalId).first<{ booking_id:string; state:string; payment_id:string|null; provider_reference:string|null; amount:number; method:string|null; itinerary_json:string }>();
    if (!row || row.state !== 'TICKET_ISSUED') throw new ApiRequestError(409, 'This ticket cannot be cancelled.');
    const refund = Math.round(row.amount * 0.8);
    const claimed = await database().prepare(`UPDATE checkout_sessions SET state='PROCESSING' WHERE token_hash=?1 AND state='PREPARED' AND consumed_at IS NULL AND expires_at>?2`).bind(tokenHash, now).run();
    if (!claimed.meta.changes) throw new ApiRequestError(409, 'Cancellation was already processed.');
    try {
      if (row.provider_reference) await simulatedPaymentProvider.refund(row.provider_reference, refund);
    } catch (error) {
      await database().prepare(`UPDATE checkout_sessions SET state='PREPARED' WHERE token_hash=?1 AND state='PROCESSING'`).bind(tokenHash).run();
      throw error;
    }
    await database().batch([
      database().prepare(`UPDATE checkout_sessions SET state='CONSUMED',consumed_at=?1 WHERE token_hash=?2 AND state='PROCESSING'`).bind(now, tokenHash),
      database().prepare(`UPDATE bookings SET state='CANCELLED',updated_at=?1 WHERE id=?2 AND state='TICKET_ISSUED'`).bind(now, row.booking_id),
      database().prepare(`UPDATE reservations SET state='CANCELLED',updated_at=?1 WHERE id=?2`).bind(now, action.reservation_id),
      database().prepare(`UPDATE payments SET state='REFUNDED',updated_at=?1 WHERE id=?2`).bind(now, row.payment_id),
      database().prepare(`INSERT OR IGNORE INTO transaction_history(id,session_id,reservation_id,kind,amount,method,label,created_at) VALUES(?1,?2,?3,'refund',?4,?5,'Ticket cancellation refund',?6)`).bind(`cancel_${row.booking_id}`, principalId, action.reservation_id, refund, row.method ?? 'original', now),
      database().prepare(`INSERT OR IGNORE INTO channel_events(id,channel_identity_id,direction,event_type,payload_json,state,attempts,available_at,created_at,updated_at) SELECT ?1,ci.id,'outbound','ticket_cancelled',?2,'PENDING',0,?3,?3,?3 FROM channel_identities ci WHERE ci.principal_id=?4 AND ci.revoked_at IS NULL`).bind(`evt_cancel_${row.booking_id}`, JSON.stringify({bookingId:row.booking_id,state:'CANCELLED',refund}), now, principalId),
    ]);
    waitUntil(deliverPendingWhatsAppEvents(principalId).catch((error)=>console.warn('[railsetu-whatsapp] cancellation notification deferred',error instanceof Error?error.name:'Error')));
    return secureJson({ cancelled: true, bookingId: row.booking_id, refund, message: 'Your mock ticket was cancelled and the prototype refund was recorded.' });
  } catch (error) {
    return apiError(error, 'Cancellation could not be completed.');
  }
}
