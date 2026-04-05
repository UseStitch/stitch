DROP TABLE `connector_oauth_profiles`;--> statement-breakpoint
DROP INDEX `connector_instances_oauth_profile_id_idx`;--> statement-breakpoint
ALTER TABLE `connector_instances` DROP COLUMN `oauth_profile_id`;