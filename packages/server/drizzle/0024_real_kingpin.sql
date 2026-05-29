CREATE TABLE `skill_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_external` integer DEFAULT false NOT NULL,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_metadata_source_uidx` ON `skill_metadata` (`source`);--> statement-breakpoint
DROP TABLE `skills`;