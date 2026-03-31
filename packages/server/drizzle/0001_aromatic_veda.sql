CREATE TABLE `llm_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'succeeded' NOT NULL,
	`is_attributable` integer DEFAULT true NOT NULL,
	`session_id` text,
	`message_id` text,
	`meeting_id` text,
	`transcription_id` text,
	`step_index` integer,
	`attempt_index` integer,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`usage` blob,
	`metadata` blob,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`error_code` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_ms` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_usage_events_run_id_idx` ON `llm_usage_events` (`run_id`);--> statement-breakpoint
CREATE INDEX `llm_usage_events_source_idx` ON `llm_usage_events` (`source`);--> statement-breakpoint
CREATE INDEX `llm_usage_events_created_at_idx` ON `llm_usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `llm_usage_events_provider_model_idx` ON `llm_usage_events` (`provider_id`,`model_id`);