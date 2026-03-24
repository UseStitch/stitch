CREATE TABLE `meetings` (
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
	CONSTRAINT "meetings_status_check" CHECK("meetings"."status" in ('detected', 'recording', 'completed'))
);
--> statement-breakpoint
CREATE TABLE `recording_transcriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`file_path` text DEFAULT '' NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`model_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`usage` blob,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "transcription_status_check" CHECK("recording_transcriptions"."status" in ('pending', 'processing', 'completed', 'failed'))
);
