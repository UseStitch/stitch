CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`auth_type` text NOT NULL,
	`label` text NOT NULL,
	`client_id` text,
	`client_secret` text,
	`api_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "connectors_auth_type_check" CHECK("connectors"."auth_type" in ('oauth2', 'api_key'))
);
--> statement-breakpoint
INSERT INTO `connectors` (`id`, `connector_id`, `auth_type`, `label`, `client_id`, `client_secret`, `api_key`, `created_at`, `updated_at`)
SELECT 'cnr_migrated_' || `id`, `connector_id`, CASE WHEN `api_key` IS NOT NULL AND (`client_id` IS NULL OR `client_secret` IS NULL) THEN 'api_key' ELSE 'oauth2' END, `label` || ' Connector', `client_id`, `client_secret`, `api_key`, `created_at`, `updated_at`
FROM `connector_instances`;--> statement-breakpoint
CREATE TABLE `__new_connector_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`connector_ref_id` text NOT NULL,
	`label` text NOT NULL,
	`applied_version` integer DEFAULT 1 NOT NULL,
	`capabilities` blob DEFAULT '[]' NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`token_expires_at` integer,
	`scopes` blob,
	`status` text DEFAULT 'pending_setup' NOT NULL,
	`auth_issue` text,
	`account_email` text,
	`account_info` blob,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connector_ref_id`) REFERENCES `connectors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "connector_status_check" CHECK(`status` in ('pending_setup', 'awaiting_auth', 'connected', 'error'))
);
--> statement-breakpoint
INSERT INTO `__new_connector_instances` (`id`, `connector_id`, `connector_ref_id`, `label`, `applied_version`, `capabilities`, `access_token`, `refresh_token`, `token_expires_at`, `scopes`, `status`, `auth_issue`, `account_email`, `account_info`, `created_at`, `updated_at`)
SELECT `id`, `connector_id`, 'cnr_migrated_' || `id`, `label`, `applied_version`, `capabilities`, `access_token`, `refresh_token`, `token_expires_at`, `scopes`, `status`, `auth_issue`, `account_email`, `account_info`, `created_at`, `updated_at`
FROM `connector_instances`;--> statement-breakpoint
DROP TABLE `connector_instances`;--> statement-breakpoint
ALTER TABLE `__new_connector_instances` RENAME TO `connector_instances`;--> statement-breakpoint
CREATE INDEX `connectors_connector_id_idx` ON `connectors` (`connector_id`);--> statement-breakpoint
CREATE INDEX `connector_instances_connector_id_idx` ON `connector_instances` (`connector_id`);--> statement-breakpoint
CREATE INDEX `connector_instances_connector_ref_id_idx` ON `connector_instances` (`connector_ref_id`);
