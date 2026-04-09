CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'recording' NOT NULL,
	`platform` text NOT NULL,
	`mime_type` text DEFAULT 'audio/wav' NOT NULL,
	`file_path` text NOT NULL,
	`file_size_bytes` integer,
	`duration_ms` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "recordings_status_check" CHECK("recordings"."status" in ('recording', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `recordings_created_at_idx` ON `recordings` (`created_at`);--> statement-breakpoint
CREATE INDEX `recordings_status_idx` ON `recordings` (`status`);