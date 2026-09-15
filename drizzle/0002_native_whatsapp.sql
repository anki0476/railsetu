ALTER TABLE `channel_identities` ADD `sender_ciphertext` text;
--> statement-breakpoint
CREATE TABLE `whatsapp_inbound_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_identity_id` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer NOT NULL,
	`available_at` integer NOT NULL,
	`response_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_whatsapp_inbound_ready` ON `whatsapp_inbound_messages` (`state`,`available_at`);
--> statement-breakpoint
CREATE TABLE `whatsapp_conversation_locks` (
	`channel_identity_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`lease_until` integer NOT NULL,
	`updated_at` integer NOT NULL
);
