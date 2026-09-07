import { createHmac, timingSafeEqual } from 'node:crypto';
import { database, type ReservationRecord } from './reservation-store';

const APPROVAL_LIFETIME_MS = 2 * 60 * 1000;
const MAX_TOKEN_LENGTH = 2_048;

export type ApprovalData = {
  operation: string;
  amount: number;
  reservationId: string;
  itineraryHash: string;
  expires: number;
  nonce: string;
};

export const allowedApprovalOperation = (value: string) => /^(?:wallet-payment|payment-(?:upi|visa|mastercard|card-[0-9]{4}|added-[A-Za-z0-9-]{8,80}|upi-[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}))$/.test(value);

export const approvalSecret = () => process.env.JAMVANTA_APPROVAL_SECRET
  ?? (process.env.NODE_ENV === 'development' ? 'jamvanta-local-development-only' : '');

const sign = (payload: string) => createHmac('sha256', approvalSecret()).update(payload).digest('base64url');

export async function prepareApprovalToken(operation: string, reservation: ReservationRecord) {
  const data: ApprovalData = {
    operation,
    amount: reservation.fare,
    reservationId: reservation.id,
    itineraryHash: reservation.itinerary_hash,
    expires: Math.min(Date.now() + APPROVAL_LIFETIME_MS, reservation.expires_at),
    nonce: crypto.randomUUID(),
  };
  await database().prepare(`INSERT INTO approval_nonces(nonce,reservation_id,operation,amount,itinerary_hash,expires_at,consumed_at) VALUES(?1,?2,?3,?4,?5,?6,NULL)`)
    .bind(data.nonce, data.reservationId, data.operation, data.amount, data.itineraryHash, data.expires).run();
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  return { token: `${encoded}.${sign(encoded)}`, expires: data.expires };
}

export function operationMatchesPaymentMethod(operation: string, method: string) {
  if (method === 'wallet') return operation === 'wallet-payment';
  if (method === 'upi') return operation === 'payment-upi' || operation.startsWith('payment-upi-');
  if (method === 'visa') return operation === 'payment-visa';
  if (method === 'mastercard') return operation === 'payment-mastercard';
  if (method.startsWith('added-')) return operation === `payment-${method}`;
  return false;
}

export async function consumeApprovalToken(token: string, expected: { reservationId: string; amount: number; itineraryHash: string; method?: string }) {
  if (!approvalSecret() || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [encoded, signature] = parts;
  const expectedSignature = sign(encoded);
  const validSignature = signature.length === expectedSignature.length
    && timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  if (!validSignature) return null;

  let data: ApprovalData;
  try { data = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as ApprovalData; }
  catch { return null; }
  const now = Date.now();
  const valid = typeof data.expires === 'number'
    && typeof data.nonce === 'string'
    && typeof data.operation === 'string'
    && allowedApprovalOperation(data.operation)
    && typeof data.amount === 'number'
    && Number.isFinite(data.amount)
    && data.amount >= 0
    && data.amount <= 1_000_000
    && data.expires > now
    && data.reservationId === expected.reservationId
    && data.amount === expected.amount
    && data.itineraryHash === expected.itineraryHash
    && (!expected.method || operationMatchesPaymentMethod(data.operation, expected.method));
  if (!valid) return null;

  const consumed = await database().prepare(`UPDATE approval_nonces SET consumed_at=?1 WHERE nonce=?2 AND consumed_at IS NULL AND expires_at>?1 AND reservation_id=?3 AND operation=?4 AND amount=?5 AND itinerary_hash=?6`)
    .bind(now, data.nonce, data.reservationId, data.operation, data.amount, data.itineraryHash).run();
  return consumed.meta.changes ? data : null;
}
