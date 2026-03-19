ALTER TABLE `keyboard_shortcuts` ADD `is_sequence` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `keyboard_shortcuts` ADD `label` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `keyboard_shortcuts` ADD `category` text DEFAULT '' NOT NULL;