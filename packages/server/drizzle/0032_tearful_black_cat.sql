CREATE TABLE `stt_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`service` text NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`raw_data` blob,
	`metadata` blob,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "stt_usage_events_service_check" CHECK("stt_usage_events"."service" in ('chat-input', 'meeting-recording'))
);
--> statement-breakpoint
CREATE INDEX `stt_usage_events_service_idx` ON `stt_usage_events` (`service`);--> statement-breakpoint
CREATE INDEX `stt_usage_events_created_at_idx` ON `stt_usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `stt_usage_events_provider_model_idx` ON `stt_usage_events` (`provider_id`,`model_id`);