CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`app` text NOT NULL,
	`app_path` text NOT NULL,
	`status` text DEFAULT 'detected' NOT NULL,
	`mic_file_path` text,
	`speaker_file_path` text,
	`duration_secs` real,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "meetings_status_check" CHECK("meetings"."status" in ('detected', 'recording', 'completed', 'dismissed'))
);
