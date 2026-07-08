PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_mail_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_instance_id` text NOT NULL,
	`provider` text NOT NULL,
	`email` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`sync_phase` text DEFAULT 'idle' NOT NULL,
	`sync_cursor` text,
	`backfill_cursor` text,
	`last_synced_at` integer,
	`last_error` text,
	`sync_frequency_seconds` integer DEFAULT 90 NOT NULL,
	`backfill_days` integer DEFAULT 30 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "mail_accounts_provider_check" CHECK("__new_mail_accounts"."provider" in ('gmail')),
	CONSTRAINT "mail_accounts_sync_phase_check" CHECK("__new_mail_accounts"."sync_phase" in ('idle', 'backfill', 'incremental', 'reconciling', 'error'))
);
--> statement-breakpoint
INSERT INTO `__new_mail_accounts`("id", "connector_instance_id", "provider", "email", "enabled", "sync_phase", "sync_cursor", "backfill_cursor", "last_synced_at", "last_error", "sync_frequency_seconds", "backfill_days", "created_at", "updated_at") SELECT "id", "connector_instance_id", "provider", "email", "enabled", "sync_phase", "sync_cursor", "backfill_cursor", "last_synced_at", "last_error", "sync_frequency_seconds", "backfill_days", "created_at", "updated_at" FROM `mail_accounts`;--> statement-breakpoint
DROP TABLE `mail_accounts`;--> statement-breakpoint
ALTER TABLE `__new_mail_accounts` RENAME TO `mail_accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `mail_accounts_connector_instance_id_uidx` ON `mail_accounts` (`connector_instance_id`);