CREATE TABLE `connector_oauth_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`label` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `connector_oauth_profiles_connector_id_idx` ON `connector_oauth_profiles` (`connector_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connector_oauth_profiles_connector_label_idx` ON `connector_oauth_profiles` (`connector_id`,`label`);--> statement-breakpoint
ALTER TABLE `connector_instances` ADD `oauth_profile_id` text;--> statement-breakpoint
CREATE INDEX `connector_instances_oauth_profile_id_idx` ON `connector_instances` (`oauth_profile_id`);