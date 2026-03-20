CREATE TABLE `agent_mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`mcp_server_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mcp_server_id`) REFERENCES `mcp_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_mcp_servers_agent_server_idx` ON `agent_mcp_servers` (`agent_id`,`mcp_server_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`transport` text DEFAULT 'http' NOT NULL,
	`url` text NOT NULL,
	`auth_config` blob NOT NULL,
	`tools` blob,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
ALTER TABLE `mcp_servers` ADD COLUMN `tools` blob;
