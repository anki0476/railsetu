import { env } from 'cloudflare:workers';

export const HOLD_TTL_MS = 5 * 60 * 1000;
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export type StoredItinerary = {
  fare: number;
  train: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  date: string;
  travelClass: string;
  comfort: number;
  profile: string;
  party: string;
  passengerCount: number;
  legs: string;
};

export type ReservationRecord = {
  id: string;
  offer_id: string;
  session_id: string;
  state: string;
  expires_at: number;
  itinerary_hash: string;
  itinerary_json: string;
  fare: number;
};

export function database() {
  return (env as unknown as { DB: D1Database }).DB;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function sessionFromRequest(request: Request) {
  const cookie = request.headers.get('cookie') ?? '';
  const existing = cookie.match(/(?:^|;\s*)railsetu_session=([A-Za-z0-9_-]{16,80})/)?.[1];
  return existing ?? crypto.randomUUID();
}

export function sessionCookie(sessionId: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `railsetu_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=86400`;
}

export async function readReservation(id: string, sessionId: string) {
  return database().prepare(`SELECT r.id,r.offer_id,r.session_id,r.state,r.expires_at,r.itinerary_hash,o.itinerary_json,o.fare
    FROM reservations r JOIN inventory_offers o ON o.id=r.offer_id WHERE r.id=?1 AND r.session_id=?2`)
    .bind(id, sessionId).first<ReservationRecord>();
}

export async function expireReservation(record: ReservationRecord, now = Date.now()) {
  if (record.state !== 'HELD' || record.expires_at > now) return record;
  await database().batch([
    database().prepare(`UPDATE reservations SET state='EXPIRED',updated_at=?1 WHERE id=?2 AND state='HELD' AND expires_at<=?1`).bind(now, record.id),
    database().prepare(`UPDATE inventory_offers SET active_reservation_id=NULL,held_until=NULL WHERE id=?1 AND active_reservation_id=?2`).bind(record.offer_id, record.id),
  ]);
  return { ...record, state: 'EXPIRED' };
}

export function reservationPayload(record: ReservationRecord) {
  return {
    reservationId: record.id,
    offerId: record.offer_id,
    state: record.state,
    expiresAt: record.expires_at,
    itineraryHash: record.itinerary_hash,
    itinerary: JSON.parse(record.itinerary_json) as StoredItinerary,
  };
}
