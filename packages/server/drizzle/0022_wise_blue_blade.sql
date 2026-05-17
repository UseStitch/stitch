CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`content` text NOT NULL,
	`hash` text NOT NULL,
	`is_external` integer DEFAULT false NOT NULL,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_name_uidx` ON `skills` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `skills_hash_uidx` ON `skills` (`hash`);