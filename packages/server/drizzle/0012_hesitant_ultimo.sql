CREATE TABLE `recording_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`transcript` blob,
	`topics` blob,
	`summary` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`error` text,
	`transcription_provider_id` text,
	`transcription_model_id` text,
	`analysis_provider_id` text,
	`analysis_model_id` text,
	`usage` blob,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recording_analyses_status_check" CHECK("recording_analyses"."status" in ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recording_analyses_recording_id_uidx` ON `recording_analyses` (`recording_id`);--> statement-breakpoint
CREATE INDEX `recording_analyses_status_idx` ON `recording_analyses` (`status`);