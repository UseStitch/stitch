CREATE TABLE `model_visibility` (
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`visibility` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_visibility_provider_model_idx` ON `model_visibility` (`provider_id`,`model_id`);