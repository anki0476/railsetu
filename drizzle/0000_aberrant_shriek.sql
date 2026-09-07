CREATE TABLE `approval_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`operation` text NOT NULL,
	`amount` integer NOT NULL,
	`itinerary_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`state` text NOT NULL,
	`pnr` text,
	`ticket_token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_reservation` ON `bookings` (`reservation_id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`response_json` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_version` text NOT NULL,
	`itinerary_json` text NOT NULL,
	`fare` integer NOT NULL,
	`active_reservation_id` text,
	`held_until` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`state` text NOT NULL,
	`provider_reference` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	`session_id` text NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	`itinerary_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transaction_history` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`reservation_id` text,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_accounts` (
	`session_id` text PRIMARY KEY NOT NULL,
	`balance` integer NOT NULL,
	`updated_at` integer NOT NULL
);
