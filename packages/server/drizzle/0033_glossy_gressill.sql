CREATE TABLE `embedding_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`metadata` blob,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `embedding_usage_events_created_at_idx` ON `embedding_usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `embedding_usage_events_provider_model_idx` ON `embedding_usage_events` (`provider_id`,`model_id`);