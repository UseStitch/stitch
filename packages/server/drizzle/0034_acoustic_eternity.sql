CREATE TABLE `meeting_note_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meeting_note_templates_updated_at_idx` ON `meeting_note_templates` (`updated_at`);--> statement-breakpoint
ALTER TABLE `recording_analyses` ADD `template_id` text;--> statement-breakpoint
ALTER TABLE `recording_analyses` DROP COLUMN `transcript`;--> statement-breakpoint
ALTER TABLE `recording_analyses` DROP COLUMN `topic_sections`;--> statement-breakpoint
ALTER TABLE `recording_analyses` DROP COLUMN `summary`;--> statement-breakpoint
ALTER TABLE `recordings` DROP COLUMN `mime_type`;--> statement-breakpoint
ALTER TABLE `recordings` DROP COLUMN `file_path`;--> statement-breakpoint
ALTER TABLE `recordings` DROP COLUMN `file_size_bytes`;