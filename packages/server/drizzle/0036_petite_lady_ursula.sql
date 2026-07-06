ALTER TABLE `messages` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `archived_reason` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `archived_at` integer;