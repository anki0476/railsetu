CREATE TABLE `channel_principals` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_session_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `channel_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`channel_account_id` text NOT NULL,
	`sender_hash` text NOT NULL,
	`principal_id` text,
	`verified_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_channel_identity_sender` ON `channel_identities` (`provider`,`channel_account_id`,`sender_hash`);
--> statement-breakpoint
CREATE TABLE `account_link_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`channel_identity_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_identity_id` text NOT NULL,
	`state_json` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `channel_events` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_identity_id` text NOT NULL,
	`direction` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer NOT NULL,
	`available_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checkout_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`principal_id` text NOT NULL,
	`reservation_id` text NOT NULL,
	`operation` text NOT NULL,
	`payment_method` text,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_request_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
