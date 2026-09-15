import { ApiRequestError, apiError, secureJson } from '../../../lib/api-security';
import { database, readReservation, reservationPayload, sessionFromRequest, sha256 } from '../../../lib/reservation-store';

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiRequestError(400, 'Invalid secure-action link.');
    const tokenHash = await sha256(token);
    const now = Date.now();
    const row = await database().prepare(`SELECT principal_id,reservation_id,operation,payment_method,state,expires_at FROM checkout_sessions WHERE token_hash=?1 AND expires_at>?2 AND consumed_at IS NULL`)
      .bind(tokenHash, now).first<{ principal_id:string; reservation_id:string; operation:string; payment_method:string|null; state:string; expires_at:number }>();
    if (!row) throw new ApiRequestError(410, 'This secure-action link has expired or was already used.');
    if (row.principal_id !== sessionFromRequest(request)) throw new ApiRequestError(403, 'Open this link in the browser used to link your RailSetu account.');
    const reservation = await readReservation(row.reservation_id, row.principal_id);
    if (!reservation) throw new ApiRequestError(404, 'The linked reservation is unavailable.');
    return secureJson({ operation: row.operation, paymentMethod: row.payment_method, expiresAt: row.expires_at, cancellationRefund: row.operation === 'cancellation' ? Math.round(reservation.fare * 0.8) : null, reservation: reservationPayload(reservation) });
  } catch (error) {
    return apiError(error, 'Secure action is unavailable.');
  }
}
