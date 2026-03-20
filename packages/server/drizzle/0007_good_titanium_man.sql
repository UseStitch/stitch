CREATE TABLE `agent_tools` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`tool_type` text NOT NULL,
	`tool_name` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_tools_type_check" CHECK("agent_tools"."tool_type" in ('stitch', 'mcp', 'plugin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tools_agent_type_name_idx` ON `agent_tools` (`agent_id`,`tool_type`,`tool_name`);