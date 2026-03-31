ALTER TABLE `connector_instances` ADD `applied_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `connector_instances` ADD `capabilities` blob DEFAULT '[]' NOT NULL;