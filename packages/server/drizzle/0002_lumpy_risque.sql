CREATE TABLE `agent_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`pattern` text,
	`permission` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_permissions_agent_tool_pattern_idx` ON `agent_permissions` (`agent_id`,`tool_name`,`pattern`);--> statement-breakpoint
ALTER TABLE `permission_responses` ADD `agent_id` text NOT NULL REFERENCES agents(id);--> statement-breakpoint
ALTER TABLE `permission_responses` ADD `suggestion` blob;