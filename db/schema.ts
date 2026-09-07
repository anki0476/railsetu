import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const inventoryOffers = sqliteTable('inventory_offers', {
  id: text('id').primaryKey(),
  inventoryVersion: text('inventory_version').notNull(),
  itineraryJson: text('itinerary_json').notNull(),
  fare: integer('fare').notNull(),
  activeReservationId: text('active_reservation_id'),
  heldUntil: integer('held_until'),
  createdAt: integer('created_at').notNull(),
});

export const reservations = sqliteTable('reservations', {
  id: text('id').primaryKey(),
  offerId: text('offer_id').notNull(),
  sessionId: text('session_id').notNull(),
  state: text('state').notNull(),
  expiresAt: integer('expires_at').notNull(),
  itineraryHash: text('itinerary_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  reservationId: text('reservation_id').notNull(),
  method: text('method').notNull(),
  amount: integer('amount').notNull(),
  state: text('state').notNull(),
  providerReference: text('provider_reference').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(),
  reservationId: text('reservation_id').notNull(),
  state: text('state').notNull(),
  pnr: text('pnr'),
  ticketToken: text('ticket_token'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_bookings_reservation').on(table.reservationId)]);

export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  operation: text('operation').notNull(),
  responseJson: text('response_json').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const approvalNonces = sqliteTable('approval_nonces', {
  nonce: text('nonce').primaryKey(),
  reservationId: text('reservation_id').notNull(),
  operation: text('operation').notNull(),
  amount: integer('amount').notNull(),
  itineraryHash: text('itinerary_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
});

export const transactionHistory = sqliteTable('transaction_history', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  reservationId: text('reservation_id'),
  kind: text('kind').notNull(),
  amount: integer('amount').notNull(),
  method: text('method').notNull(),
  label: text('label').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const walletAccounts = sqliteTable('wallet_accounts', {
  sessionId: text('session_id').primaryKey(),
  balance: integer('balance').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
