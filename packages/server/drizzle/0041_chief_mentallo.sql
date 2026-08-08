CREATE TABLE `background_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_session_id` text NOT NULL,
	`child_session_id` text NOT NULL,
	`origin_message_id` text NOT NULL,
	`origin_tool_call_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`delivery_status` text DEFAULT 'pending' NOT NULL,
	`delivery_message_id` text,
	`result` text,
	`error` text,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`active_toolset_ids` blob NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`delivered_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`origin_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `background_tasks_parent_status_idx` ON `background_tasks` (`parent_session_id`,`status`);--> statement-breakpoint
CREATE INDEX `background_tasks_parent_delivery_idx` ON `background_tasks` (`parent_session_id`,`delivery_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `background_tasks_child_session_id_unique` ON `background_tasks` (`child_session_id`);--> statement-breakpoint
CREATE INDEX `background_tasks_origin_idx` ON `background_tasks` (`origin_message_id`,`origin_tool_call_id`);