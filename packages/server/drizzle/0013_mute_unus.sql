PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'recording' NOT NULL,
	`platform` text DEFAULT 'manual' NOT NULL,
	`mime_type` text DEFAULT 'audio/ogg' NOT NULL,
	`file_path` text NOT NULL,
	`file_size_bytes` integer,
	`duration_ms` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "recordings_status_check" CHECK("__new_recordings"."status" in ('recording', 'completed', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_recordings`("id", "title", "source", "status", "platform", "mime_type", "file_path", "file_size_bytes", "duration_ms", "started_at", "ended_at", "error", "created_at", "updated_at") SELECT "id", "title", "source", "status", "platform", "mime_type", "file_path", "file_size_bytes", "duration_ms", "started_at", "ended_at", "error", "created_at", "updated_at" FROM `recordings`;--> statement-breakpoint
DROP TABLE `recordings`;--> statement-breakpoint
ALTER TABLE `__new_recordings` RENAME TO `recordings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `recordings_created_at_idx` ON `recordings` (`created_at`);--> statement-breakpoint
CREATE INDEX `recordings_status_idx` ON `recordings` (`status`);