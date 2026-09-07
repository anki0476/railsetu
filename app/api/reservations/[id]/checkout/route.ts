import { ApiRequestError, apiError, enforceRateLimit, readJsonBody, requireSameOrigin, secureJson } from '../../../../lib/api-security';
import { simulatedBookingProvider, simulatedPaymentProvider } from '../../../../lib/booking-providers';
import { consumeApprovalToken } from '../../../../lib/jamvanta-approval';
import { database, expireReservation, IDEMPOTENCY_TTL_MS, readReservation, sessionFromRequest, sha256, type StoredItinerary } from '../../../../lib/reservation-store';

const validId = (value: string) => /^res_[a-f0-9]{32}$/.test(value);
const validMethod = (value: string) => /^(?:wallet|upi|visa|mastercard|added-[A-Za-z0-9-]{8,80})$/.test(value);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const limited = enforceRateLimit(request, 'reservation-checkout', 18);
    if (limited) return limited;
    const { id } = await context.params;
    if (!validId(id)) throw new ApiRequestError(400, 'Invalid reservation.');
    const body = await readJsonBody(request, 8_192) as { method?: unknown; idempotencyKey?: unknown; approvalToken?: unknown };
    if (typeof body.method !== 'string' || !validMethod(body.method)) throw new ApiRequestError(400, 'Choose a valid payment method.');
    if (typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(body.idempotencyKey)) throw new ApiRequestError(400, 'A valid idempotency key is required.');
    if (typeof body.approvalToken !== 'string') throw new ApiRequestError(403, 'Fresh payment approval is required.');

    const sessionId = sessionFromRequest(request);
    const db = database();
    const idempotencyId = `${sessionId}:checkout:${body.idempotencyKey}`;
    const replay = await db.prepare(`SELECT response_json FROM idempotency_keys WHERE key=?1 AND operation='checkout' AND expires_at>?2`).bind(idempotencyId, Date.now()).first<{ response_json: string }>();
    if (replay) return secureJson(JSON.parse(replay.response_json));

    let reservation = await readReservation(id, sessionId);
    if (!reservation) return secureJson({ error: { code: 'RESERVATION_NOT_FOUND', message: 'This seat hold is unavailable.' } }, { status: 404 });
    reservation = await expireReservation(reservation);
    if (reservation.state === 'EXPIRED' || reservation.expires_at <= Date.now()) return secureJson({ error: { code: 'HOLD_EXPIRED', message: 'Your seat hold expired before payment. No charge was made.' } }, { status: 409 });
    const priorBooking = await db.prepare(`SELECT id,state,pnr,ticket_token FROM bookings WHERE reservation_id=?1`).bind(id).first<{ id: string; state: string; pnr: string; ticket_token: string }>();
    if (priorBooking?.state === 'TICKET_ISSUED') {
      const payload = { bookingId: priorBooking.id, state: priorBooking.state, pnr: priorBooking.pnr, ticketToken: priorBooking.ticket_token, itinerary: JSON.parse(reservation.itinerary_json) as StoredItinerary };
      return secureJson(payload);
    }
    if (reservation.state !== 'HELD') return secureJson({ error: { code: 'PAYMENT_PENDING', message: 'This booking is already being processed.' } }, { status: 409 });
    const approval = await consumeApprovalToken(body.approvalToken, {
      reservationId: reservation.id,
      amount: reservation.fare,
      itineraryHash: reservation.itinerary_hash,
      method: body.method,
    });
    if (!approval) return secureJson({ error: { code: 'APPROVAL_REQUIRED', message: 'This payment approval is invalid, expired, or has already been used.' } }, { status: 403 });

    const now = Date.now();
    const paymentId = `pay_${(await sha256(`${id}|${body.idempotencyKey}`)).slice(0, 32)}`;
    const bookingId = `book_${(await sha256(id)).slice(0, 32)}`;
    const methodKind = body.method === 'wallet' ? 'wallet' : body.method === 'upi' ? 'upi' : 'card';
    const claimed = await db.prepare(`UPDATE reservations SET state='PAYMENT_AUTHORIZING',updated_at=?1 WHERE id=?2 AND session_id=?3 AND state='HELD' AND expires_at>?1`).bind(now, id, sessionId).run();
    if (!claimed.meta.changes) return secureJson({ error: { code: 'HOLD_UNAVAILABLE', message: 'The seat hold changed before payment. No charge was made.' } }, { status: 409 });

    if (methodKind === 'wallet') {
      await db.prepare(`INSERT OR IGNORE INTO wallet_accounts(session_id,balance,updated_at) VALUES(?1,10000,?2)`).bind(sessionId, now).run();
      const debit = await db.prepare(`UPDATE wallet_accounts SET balance=balance-?1,updated_at=?2 WHERE session_id=?3 AND balance>=?1`).bind(reservation.fare, now, sessionId).run();
      if (!debit.meta.changes) {
        await db.prepare(`UPDATE reservations SET state='HELD',updated_at=?1 WHERE id=?2 AND state='PAYMENT_AUTHORIZING'`).bind(Date.now(), id).run();
        return secureJson({ error: { code: 'INSUFFICIENT_WALLET_BALANCE', message: 'Your RailSetu Wallet balance is insufficient.' } }, { status: 409 });
      }
    }

    let authorization: { reference: string; captured: boolean } | undefined;
    try {
      authorization = await simulatedPaymentProvider.authorize({ reservationId: id, amount: reservation.fare, method: methodKind });
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO payments(id,reservation_id,method,amount,state,provider_reference,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?7)`).bind(paymentId, id, body.method, reservation.fare, authorization.captured ? 'PAYMENT_CAPTURED' : 'PAYMENT_AUTHORIZED', authorization.reference, now),
        db.prepare(`UPDATE reservations SET state=?1,updated_at=?2 WHERE id=?3 AND state='PAYMENT_AUTHORIZING'`).bind(authorization.captured ? 'PAYMENT_CAPTURED' : 'PAYMENT_AUTHORIZED', now, id),
      ]);
      const confirmed = await simulatedBookingProvider.confirm({ reservationId: id, itineraryHash: reservation.itinerary_hash });
      const ticketToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO bookings(id,reservation_id,state,pnr,ticket_token,created_at,updated_at) VALUES(?1,?2,'BOOKING_CONFIRMED',?3,?4,?5,?5)`).bind(bookingId, id, confirmed.pnr, ticketToken, now),
        db.prepare(`UPDATE reservations SET state='BOOKING_CONFIRMED',updated_at=?1 WHERE id=?2 AND state IN ('PAYMENT_AUTHORIZED','PAYMENT_CAPTURED')`).bind(now, id),
      ]);
      if (!authorization.captured) {
        await simulatedPaymentProvider.capture(authorization.reference);
        await db.prepare(`UPDATE payments SET state='PAYMENT_CAPTURED',updated_at=?1 WHERE id=?2 AND state='PAYMENT_AUTHORIZED'`).bind(Date.now(), paymentId).run();
      }
      const completedAt = Date.now();
      const itinerary = JSON.parse(reservation.itinerary_json) as StoredItinerary;
      const payload = { bookingId, state: 'TICKET_ISSUED', pnr: confirmed.pnr, ticketToken, itinerary };
      await db.batch([
        db.prepare(`UPDATE bookings SET state='TICKET_ISSUED',updated_at=?1 WHERE id=?2 AND state='BOOKING_CONFIRMED'`).bind(completedAt, bookingId),
        db.prepare(`UPDATE reservations SET state='TICKET_ISSUED',updated_at=?1 WHERE id=?2 AND state='BOOKING_CONFIRMED'`).bind(completedAt, id),
        db.prepare(`UPDATE inventory_offers SET active_reservation_id=NULL,held_until=NULL WHERE id=?1 AND active_reservation_id=?2`).bind(reservation.offer_id, id),
        db.prepare(`INSERT OR IGNORE INTO transaction_history(id,session_id,reservation_id,kind,amount,method,label,created_at) VALUES(?1,?2,?3,'payment',?4,?5,?6,?7)`).bind(`txn_${paymentId}`, sessionId, id, -reservation.fare, body.method, `Ticket · ${itinerary.train}`, completedAt),
        db.prepare(`INSERT OR REPLACE INTO idempotency_keys(key,operation,response_json,expires_at) VALUES(?1,'checkout',?2,?3)`).bind(idempotencyId, JSON.stringify(payload), completedAt + IDEMPOTENCY_TTL_MS),
      ]);
      return secureJson(payload);
    } catch {
      const failedAt = Date.now();
      if (authorization?.captured) {
        await simulatedPaymentProvider.refund(authorization.reference, reservation.fare);
        if (methodKind === 'wallet') await db.prepare(`UPDATE wallet_accounts SET balance=balance+?1,updated_at=?2 WHERE session_id=?3`).bind(reservation.fare, failedAt, sessionId).run();
        await db.prepare(`UPDATE payments SET state='REFUNDED',updated_at=?1 WHERE id=?2`).bind(failedAt, paymentId).run();
      } else if (authorization) {
        await simulatedPaymentProvider.void(authorization.reference);
        await db.prepare(`UPDATE payments SET state='PAYMENT_VOIDED',updated_at=?1 WHERE id=?2`).bind(failedAt, paymentId).run();
      }
      await db.batch([
        db.prepare(`UPDATE reservations SET state='BOOKING_FAILED',updated_at=?1 WHERE id=?2`).bind(failedAt, id),
        db.prepare(`UPDATE inventory_offers SET active_reservation_id=NULL,held_until=NULL WHERE id=?1 AND active_reservation_id=?2`).bind(reservation.offer_id, id),
        db.prepare(`INSERT OR IGNORE INTO transaction_history(id,session_id,reservation_id,kind,amount,method,label,created_at) VALUES(?1,?2,?3,'refund',?4,?5,'Automatic refund',?6)`).bind(`refund_${paymentId}`, sessionId, id, reservation.fare, body.method, failedAt),
      ]);
      return secureJson({ error: { code: 'BOOKING_FAILED', message: authorization?.captured ? 'Booking failed after payment. Your refund has been completed.' : 'Booking failed. The payment authorization was voided.' } }, { status: 409 });
    }
  } catch (error) {
    return apiError(error, 'Payment could not be completed.');
  }
}
