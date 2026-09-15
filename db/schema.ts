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

export const channelPrincipals = sqliteTable('channel_principals', {
  id: text('id').primaryKey(),
  browserSessionId: text('browser_session_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const channelIdentities = sqliteTable('channel_identities', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  channelAccountId: text('channel_account_id').notNull(),
  senderHash: text('sender_hash').notNull(),
  senderCiphertext: text('sender_ciphertext'),
  principalId: text('principal_id'),
  verifiedAt: integer('verified_at'),
  revokedAt: integer('revoked_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_channel_identity_sender').on(table.provider, table.channelAccountId, table.senderHash)]);

export const accountLinkTokens = sqliteTable('account_link_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  channelIdentityId: text('channel_identity_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
  createdAt: integer('created_at').notNull(),
});

export const agentConversations = sqliteTable('agent_conversations', {
  id: text('id').primaryKey(),
  channelIdentityId: text('channel_identity_id').notNull(),
  stateJson: text('state_json').notNull(),
  version: integer('version').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const channelEvents = sqliteTable('channel_events', {
  id: text('id').primaryKey(),
  channelIdentityId: text('channel_identity_id').notNull(),
  direction: text('direction').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json').notNull(),
  state: text('state').notNull(),
  attempts: integer('attempts').notNull(),
  availableAt: integer('available_at').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const checkoutSessions = sqliteTable('checkout_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  principalId: text('principal_id').notNull(),
  reservationId: text('reservation_id').notNull(),
  operation: text('operation').notNull(),
  paymentMethod: text('payment_method'),
  state: text('state').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
  createdAt: integer('created_at').notNull(),
});

export const serviceRequestNonces = sqliteTable('service_request_nonces', {
  nonce: text('nonce').primaryKey(),
  serviceId: text('service_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const whatsappInboundMessages = sqliteTable('whatsapp_inbound_messages', {
  id: text('id').primaryKey(),
  channelIdentityId: text('channel_identity_id').notNull(),
  state: text('state').notNull(),
  attempts: integer('attempts').notNull(),
  availableAt: integer('available_at').notNull(),
  responseJson: text('response_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const whatsappConversationLocks = sqliteTable('whatsapp_conversation_locks', {
  channelIdentityId: text('channel_identity_id').primaryKey(),
  owner: text('owner').notNull(),
  leaseUntil: integer('lease_until').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
