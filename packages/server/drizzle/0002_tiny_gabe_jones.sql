CREATE TABLE `connector_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`label` text NOT NULL,
	`client_id` text,
	`client_secret` text,
	`api_key` text,
	`access_token` text,
	`refresh_token` text,
	`token_expires_at` integer,
	`scopes` blob,
	`status` text DEFAULT 'pending_setup' NOT NULL,
	`account_email` text,
	`account_info` blob,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "connector_status_check" CHECK("connector_instances"."status" in ('pending_setup', 'awaiting_auth', 'connected', 'error'))
);
--> statement-breakpoint
CREATE INDEX `connector_instances_connector_id_idx` ON `connector_instances` (`connector_id`);