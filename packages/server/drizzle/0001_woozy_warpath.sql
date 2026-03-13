CREATE TABLE `provider_config` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`credentials` blob NOT NULL,
	`updated_at` integer NOT NULL
);
