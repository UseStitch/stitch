CREATE TABLE `meeting_note_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meeting_note_templates_updated_at_idx` ON `meeting_note_templates` (`updated_at`);