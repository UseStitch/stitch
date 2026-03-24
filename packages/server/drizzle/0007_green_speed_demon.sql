PRAGMA foreign_keys=OFF;--> statement-breakpoint
DELETE FROM `meetings` WHERE `status` = 'dismissed';--> statement-breakpoint
CREATE TABLE `__new_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`app` text NOT NULL,
	`app_path` text NOT NULL,
	`status` text DEFAULT 'detected' NOT NULL,
	`recording_file_path` text,
	`duration_secs` real,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "meetings_status_check" CHECK("__new_meetings"."status" in ('detected', 'recording', 'completed'))
);
--> statement-breakpoint
INSERT INTO `__new_meetings`("id", "app", "app_path", "status", "recording_file_path", "duration_secs", "started_at", "ended_at", "created_at", "updated_at") SELECT "id", "app", "app_path", "status", "recording_file_path", "duration_secs", "started_at", "ended_at", "created_at", "updated_at" FROM `meetings`;--> statement-breakpoint
DROP TABLE `meetings`;--> statement-breakpoint
ALTER TABLE `__new_meetings` RENAME TO `meetings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;