import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiRequestError, apiError, enforceRateLimit, readJsonBody, requireSameOrigin, secureJson } from '../../../lib/api-security';
import { database, readReservation, sessionFromRequest } from '../../../lib/reservation-store';

const lifetime = 2 * 60 * 1000;
const MAX_BODY_BYTES = 4_096;
const MAX_TOKEN_LENGTH = 2_048;
const allowedOperation = (value: string) => /^(?:wallet-payment|payment-(?:upi|visa|mastercard|card-[0-9]{4}))$/.test(value);
const secret = () => process.env.JAMVANTA_APPROVAL_SECRET ?? (process.env.NODE_ENV === 'development' ? 'jamvanta-local-development-only' : '');
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const limited = enforceRateLimit(request, 'jamvanta-approval', 24);
    if (limited) return limited;
    if (!secret()) return secureJson({ error: 'Approval secret is not configured.' }, { status: 503 });
    const value = await readJsonBody(request, MAX_BODY_BYTES);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiRequestError(400, 'Invalid approval request.');
    const body = value as { operation?: unknown; amount?: unknown; token?: unknown; reservationId?: unknown };
    if (typeof body.token === 'string') {
      if (body.token.length > MAX_TOKEN_LENGTH) throw new ApiRequestError(400, 'Invalid approval token.');
      const parts = body.token.split('.');
      if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return secureJson({ approved: false }, { status: 400 });
      const [encoded, signature] = parts;
      const expected = sign(encoded);
      const validSignature = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!validSignature) return secureJson({ approved: false }, { status: 400 });

      let data: { operation?: unknown; amount?: unknown; expires?: unknown; nonce?: unknown; reservationId?: unknown; itineraryHash?: unknown };
      try { data = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as typeof data; }
      catch { return secureJson({ approved: false }, { status: 400 }); }
      const validData = typeof data.expires === 'number'
        && typeof data.nonce === 'string'
        && typeof data.operation === 'string'
        && allowedOperation(data.operation)
        && typeof data.amount === 'number'
        && Number.isFinite(data.amount)
        && data.amount >= 0
        && data.amount <= 1_000_000;
      const now = Date.now();
      if (!validData || data.expires! <= now) return secureJson({ approved: false }, { status: 400 });
      const consumed = await database().prepare(`UPDATE approval_nonces SET consumed_at=?1 WHERE nonce=?2 AND consumed_at IS NULL AND expires_at>?1 AND reservation_id=?3 AND amount=?4 AND itinerary_hash=?5`)
        .bind(now, data.nonce, data.reservationId, data.amount, data.itineraryHash).run();
      if (!consumed.meta.changes) return secureJson({ approved: false }, { status: 400 });
      return secureJson({ approved: true, data });
    }

    const operation = typeof body.operation === 'string' && allowedOperation(body.operation) ? body.operation : 'wallet-payment';
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new ApiRequestError(400, 'Invalid approval amount.');
    if (typeof body.reservationId !== 'string') throw new ApiRequestError(400, 'A reservation is required for payment approval.');
    const reservation = await readReservation(body.reservationId, sessionFromRequest(request));
    if (!reservation || reservation.state !== 'HELD' || reservation.expires_at <= Date.now() || reservation.fare !== amount) throw new ApiRequestError(409, 'The seat hold is no longer valid.');
    const data = { operation, amount, reservationId: reservation.id, itineraryHash: reservation.itinerary_hash, expires: Math.min(Date.now() + lifetime, reservation.expires_at), nonce: crypto.randomUUID() };
    await database().prepare(`INSERT INTO approval_nonces(nonce,reservation_id,operation,amount,itinerary_hash,expires_at,consumed_at) VALUES(?1,?2,?3,?4,?5,?6,NULL)`)
      .bind(data.nonce, data.reservationId, data.operation, data.amount, data.itineraryHash, data.expires).run();
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
    return secureJson({ token: `${encoded}.${sign(encoded)}`, expires: data.expires });
  } catch (error) {
    return apiError(error, 'Approval could not be completed.');
  }
}
