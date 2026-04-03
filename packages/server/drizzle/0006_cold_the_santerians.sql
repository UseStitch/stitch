CREATE TABLE `scheduled_job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`key` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`scheduled_for` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `scheduled_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "scheduled_job_runs_status_check" CHECK("scheduled_job_runs"."status" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `scheduled_job_runs_job_id_idx` ON `scheduled_job_runs` (`job_id`);--> statement-breakpoint
CREATE INDEX `scheduled_job_runs_key_idx` ON `scheduled_job_runs` (`key`);--> statement-breakpoint
CREATE TABLE `scheduled_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`schedule` blob NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`max_concurrency` integer DEFAULT 1 NOT NULL,
	`queue_enabled` integer DEFAULT true NOT NULL,
	`catchup` text DEFAULT 'one' NOT NULL,
	`catchup_max_runs` integer DEFAULT 100 NOT NULL,
	`next_run_at` integer NOT NULL,
	`running_count` integer DEFAULT 0 NOT NULL,
	`queued_count` integer DEFAULT 0 NOT NULL,
	`total_runs` integer DEFAULT 0 NOT NULL,
	`total_failures` integer DEFAULT 0 NOT NULL,
	`last_run_at` integer,
	`last_success_at` integer,
	`last_error_at` integer,
	`last_error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "scheduled_jobs_catchup_check" CHECK("scheduled_jobs"."catchup" in ('none', 'one', 'all'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_jobs_key_uidx` ON `scheduled_jobs` (`key`);--> statement-breakpoint
CREATE INDEX `scheduled_jobs_next_run_at_idx` ON `scheduled_jobs` (`next_run_at`);