ALTER TABLE `lance_migrations` ADD `id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lance_migrations` ADD `prev_id` text;--> statement-breakpoint
ALTER TABLE `lance_migrations` ADD `checksum` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lance_migrations` ADD `status` text DEFAULT 'applied' NOT NULL;--> statement-breakpoint
ALTER TABLE `lance_migrations` ADD `error` text;