import { activeJourneyInventoryProvider } from './active-journey-inventory';
import { ApiRequestError } from './api-security';
import { getOrCreateChannelIdentity, parseChannelRef, readConversation, requireLinkedPrincipal, saveConversation } from './channel-store';
import { findJourneyRecommendations, solveJourneyFromInventory, type JourneyOutcome } from './journey-engine';
import { parseJourneyRequest } from './journey-request';
import { database, HOLD_TTL_MS, IDEMPOTENCY_TTL_MS, readReservation, reservationPayload, sha256, type StoredItinerary } from './reservation-store';

const LINK_TTL_MS = 10 * 60 * 1000;
const CHECKOUT_MAX_TTL_MS = 5 * 60 * 1000;
const validPaymentMethod = /^(?:wallet|upi|visa|mastercard|added-[A-Za-z0-9-]{8,80})$/;

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiRequestError(400, 'A JSON object is required.');
  return value as Record<string, unknown>;
}

function publicUrl() {
  const configured = process.env.RAILSETU_PUBLIC_URL;
  if (!configured) throw new ApiRequestError(503, 'RailSetu public URL is not configured.');
  return configured.replace(/\/$/, '');
}

export async function channelContext(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  const conversation = await readConversation(identity.id, ref.conversationId);
  return {
    identity: { linked: Boolean(identity.principal_id && identity.verified_at) },
    conversation,
    allowedNextActions: identity.principal_id ? ['search','hold','checkout','status','ticket','cancel'] : ['search','link'],
  };
}

export async function updateChannelContext(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  const version = Number(body.expectedVersion);
  if (!Number.isInteger(version) || version < 0) throw new ApiRequestError(400, 'A valid conversation version is required.');
  const nextVersion = await saveConversation(identity.id, ref.conversationId, body.state ?? {}, version);
  return { saved: true, version: nextVersion };
}

export async function createChannelLink(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  if (identity.principal_id && identity.verified_at) return { linked: true };
  const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const tokenHash = await sha256(token);
  const now = Date.now();
  await database().prepare(`INSERT INTO account_link_tokens(token_hash,channel_identity_id,expires_at,consumed_at,created_at) VALUES(?1,?2,?3,NULL,?4)`)
    .bind(tokenHash, identity.id, now + LINK_TTL_MS, now).run();
  return { linked: false, expiresAt: now + LINK_TTL_MS, url: `${publicUrl()}/channel/link?token=${token}` };
}

export async function searchChannelJourneys(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  await getOrCreateChannelIdentity(ref);
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new ApiRequestError(400, 'A valid journey date is required.');
  const query = parseJourneyRequest({ query: body.query });
  const inventory = await activeJourneyInventoryProvider.getInventory(query);
  const outcome: JourneyOutcome = solveJourneyFromInventory(query, inventory);
  if (!outcome.solutions.length) outcome.recommendations = await findJourneyRecommendations(query, activeJourneyInventoryProvider);
  return { date: body.date, inventoryVersion: activeJourneyInventoryProvider.version, outcome };
}

export async function holdChannelJourney(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  const principalId = requireLinkedPrincipal(identity);
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new ApiRequestError(400, 'A valid journey date is required.');
  if (typeof body.offerId !== 'string' || body.offerId.length > 180) throw new ApiRequestError(400, 'A valid journey offer is required.');
  if (typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(body.idempotencyKey)) throw new ApiRequestError(400, 'A valid idempotency key is required.');

  const query = parseJourneyRequest({ query: body.query });
  const inventory = await activeJourneyInventoryProvider.getInventory(query);
  const outcome = solveJourneyFromInventory(query, inventory);
  const solution = outcome.solutions.find((candidate) => candidate.id === body.offerId);
  if (!solution) throw new ApiRequestError(409, 'OFFER_UNAVAILABLE');

  const now = Date.now();
  const expiresAt = now + HOLD_TTL_MS;
  const reservationId = `res_${(await sha256(`${principalId}|${body.idempotencyKey}`)).slice(0, 32)}`;
  const inventoryOfferId = `off_${(await sha256(`${activeJourneyInventoryProvider.version}|${body.date}|${solution.id}`)).slice(0, 32)}`;
  const itinerary: StoredItinerary = {
    fare: solution.fare, train: `${solution.trainNumber} · ${solution.trainName}`, from: query.from,
    fromName: solution.legs[0].from.name, to: query.to, toName: solution.legs.at(-1)?.to.name ?? query.to,
    date: body.date, travelClass: query.travelClass, comfort: solution.comfort, profile: query.profile,
    party: solution.passengerJourneys.map((journey) => journey.passenger.name).join('|'), passengerCount: solution.passengerJourneys.length,
    legs: solution.legs.map((leg) => [leg.from.code,leg.from.time,leg.to.code,leg.to.time,leg.coach,leg.seat,leg.berth].join('~')).join('|'),
  };
  const itineraryJson = JSON.stringify(itinerary);
  const itineraryHash = await sha256(itineraryJson);
  const db = database();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO inventory_offers(id,inventory_version,itinerary_json,fare,created_at) VALUES(?1,?2,?3,?4,?5)`).bind(inventoryOfferId, activeJourneyInventoryProvider.version, itineraryJson, solution.fare, now),
    db.prepare(`UPDATE inventory_offers SET active_reservation_id=?1,held_until=?2 WHERE id=?3 AND (active_reservation_id IS NULL OR held_until<=?4 OR active_reservation_id=?1)`).bind(reservationId, expiresAt, inventoryOfferId, now),
    db.prepare(`INSERT OR IGNORE INTO reservations(id,offer_id,session_id,state,expires_at,itinerary_hash,created_at,updated_at) SELECT ?1,?2,?3,'HELD',?4,?5,?6,?6 FROM inventory_offers WHERE id=?2 AND active_reservation_id=?1`).bind(reservationId, inventoryOfferId, principalId, expiresAt, itineraryHash, now),
    db.prepare(`INSERT OR IGNORE INTO idempotency_keys(key,operation,response_json,expires_at) VALUES(?1,'channel-reserve',?2,?3)`).bind(`${principalId}:channel-reserve:${body.idempotencyKey}`, reservationId, now + IDEMPOTENCY_TTL_MS),
  ]);
  const record = await readReservation(reservationId, principalId);
  if (!record) throw new ApiRequestError(409, 'OFFER_UNAVAILABLE');
  return reservationPayload(record);
}

export async function createChannelCheckout(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  const principalId = requireLinkedPrincipal(identity);
  if (typeof body.reservationId !== 'string') throw new ApiRequestError(400, 'Reservation is required.');
  if (typeof body.paymentMethod !== 'string' || !validPaymentMethod.test(body.paymentMethod)) throw new ApiRequestError(400, 'Choose a valid payment method.');
  const reservation = await readReservation(body.reservationId, principalId);
  if (!reservation || reservation.state !== 'HELD' || reservation.expires_at <= Date.now()) throw new ApiRequestError(409, 'HOLD_EXPIRED');
  const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = Math.min(reservation.expires_at, now + CHECKOUT_MAX_TTL_MS);
  await database().prepare(`INSERT INTO checkout_sessions(token_hash,principal_id,reservation_id,operation,payment_method,state,expires_at,consumed_at,created_at) VALUES(?1,?2,?3,'payment',?4,'PREPARED',?5,NULL,?6)`)
    .bind(tokenHash, principalId, reservation.id, body.paymentMethod, expiresAt, now).run();
  return { reservationId: reservation.id, amount: reservation.fare, paymentMethod: body.paymentMethod, expiresAt, url: `${publicUrl()}/channel/checkout?token=${token}` };
}

export async function listChannelBookings(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  const principalId = requireLinkedPrincipal(identity);
  const rows = await database().prepare(`SELECT b.id,b.state,b.pnr,b.ticket_token,b.updated_at,o.itinerary_json,p.method FROM bookings b JOIN reservations r ON r.id=b.reservation_id JOIN inventory_offers o ON o.id=r.offer_id LEFT JOIN payments p ON p.reservation_id=r.id WHERE r.session_id=?1 ORDER BY b.updated_at DESC LIMIT 20`)
    .bind(principalId).all<{ id: string; state: string; pnr: string | null; ticket_token: string | null; updated_at: number; itinerary_json: string; method: string | null }>();
  return { bookings: rows.results.map((row) => ({ bookingId: row.id, state: row.state, pnr: row.pnr, paymentMethod: row.method, updatedAt: row.updated_at, itinerary: JSON.parse(row.itinerary_json) as StoredItinerary, ticketUrl: row.state === 'TICKET_ISSUED' && row.ticket_token ? `${publicUrl()}/ticket?booking=${row.id}&token=${row.ticket_token}` : null })) };
}

export async function quoteChannelCancellation(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  const principalId = requireLinkedPrincipal(identity);
  if (typeof body.bookingId !== 'string') throw new ApiRequestError(400, 'Booking is required.');
  const row = await database().prepare(`SELECT b.id,b.state,r.id reservation_id,o.fare,o.itinerary_json FROM bookings b JOIN reservations r ON r.id=b.reservation_id JOIN inventory_offers o ON o.id=r.offer_id WHERE b.id=?1 AND r.session_id=?2`).bind(body.bookingId, principalId).first<{ id:string; state:string; reservation_id:string; fare:number; itinerary_json:string }>();
  if (!row || row.state !== 'TICKET_ISSUED') throw new ApiRequestError(409, 'This ticket cannot be cancelled.');
  const refund = Math.round(row.fare * 0.8);
  return { bookingId: row.id, reservationId: row.reservation_id, fare: row.fare, cancellationFee: row.fare - refund, refund, policy: 'Prototype estimate: 80% refundable. A live provider must return the authoritative railway-policy quote.', itinerary: JSON.parse(row.itinerary_json) as StoredItinerary };
}

export async function prepareChannelCancellation(value: unknown) {
  const quote = await quoteChannelCancellation(value);
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  const principalId = requireLinkedPrincipal(identity);
  const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const tokenHash = await sha256(token);
  const now = Date.now();
  await database().prepare(`INSERT INTO checkout_sessions(token_hash,principal_id,reservation_id,operation,payment_method,state,expires_at,consumed_at,created_at) VALUES(?1,?2,?3,'cancellation',NULL,'PREPARED',?4,NULL,?5)`)
    .bind(tokenHash, principalId, quote.reservationId, now + 10 * 60 * 1000, now).run();
  return { ...quote, expiresAt: now + 10 * 60 * 1000, url: `${publicUrl()}/channel/checkout?token=${token}` };
}

export async function pullChannelEvents(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  requireLinkedPrincipal(identity);
  const now = Date.now();
  // A stale processing lease is made available again so a crashed dispatcher
  // cannot permanently lose a ticket or refund notification.
  await database().prepare(`UPDATE channel_events SET state='PENDING',available_at=?1,updated_at=?1 WHERE channel_identity_id=?2 AND state='PROCESSING' AND available_at<=?1`).bind(now, identity.id).run();
  const rows = await database().prepare(`SELECT id,event_type,payload_json,attempts FROM channel_events WHERE channel_identity_id=?1 AND direction='outbound' AND state='PENDING' AND available_at<=?2 ORDER BY created_at LIMIT 10`)
    .bind(identity.id, now).all<{ id:string; event_type:string; payload_json:string; attempts:number }>();
  for (const row of rows.results) {
    await database().prepare(`UPDATE channel_events SET state='PROCESSING',attempts=attempts+1,available_at=?1,updated_at=?2 WHERE id=?3 AND state='PENDING'`).bind(now + 60_000, now, row.id).run();
  }
  return { events: rows.results.map((row) => ({ id:row.id, type:row.event_type, payload:JSON.parse(row.payload_json) as unknown, attempt:row.attempts + 1 })) };
}

export async function acknowledgeChannelEvents(value: unknown) {
  const body = asRecord(value);
  const ref = parseChannelRef(body.channel);
  const identity = await getOrCreateChannelIdentity(ref);
  requireLinkedPrincipal(identity);
  const ids = Array.isArray(body.eventIds) ? body.eventIds.filter((id): id is string => typeof id === 'string' && /^evt_[A-Za-z0-9_]{8,100}$/.test(id)).slice(0, 10) : [];
  if (!ids.length) throw new ApiRequestError(400, 'At least one valid event ID is required.');
  const now = Date.now();
  for (const id of ids) await database().prepare(`UPDATE channel_events SET state='DELIVERED',updated_at=?1 WHERE id=?2 AND channel_identity_id=?3 AND state='PROCESSING'`).bind(now, id, identity.id).run();
  return { acknowledged: ids };
}
