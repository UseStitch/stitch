PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_keyboard_shortcuts` (
	`action_id` text PRIMARY KEY NOT NULL,
	`hotkey` text,
	`is_sequence` integer DEFAULT false NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Workspace' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_keyboard_shortcuts`("action_id", "hotkey", "is_sequence", "label", "category", "created_at", "updated_at") SELECT "action_id", "hotkey", "is_sequence", "label", "category", "created_at", "updated_at" FROM `keyboard_shortcuts`;--> statement-breakpoint
DROP TABLE `keyboard_shortcuts`;--> statement-breakpoint
ALTER TABLE `__new_keyboard_shortcuts` RENAME TO `keyboard_shortcuts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;