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
CREATE UNIQUE INDEX `agent_tools_agent_type_name_idx` ON `agent_tools` (`agent_id`,`tool_type`,`tool_name`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'primary' NOT NULL,
	`is_deletable` integer DEFAULT true NOT NULL,
	`system_prompt` text,
	`use_base_prompt` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "agents_type_check" CHECK("agents"."type" in ('primary', 'sub'))
);
--> statement-breakpoint
CREATE TABLE `keyboard_shortcuts` (
	`action_id` text PRIMARY KEY NOT NULL,
	`hotkey` text,
	`is_sequence` integer DEFAULT false NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`transport` text DEFAULT 'http' NOT NULL,
	`url` text NOT NULL,
	`auth_config` blob NOT NULL,
	`tools` blob,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` blob NOT NULL,
	`model_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`usage` blob,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`finish_reason` text,
	`is_summary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `model_visibility` (
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`visibility` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_visibility_provider_model_idx` ON `model_visibility` (`provider_id`,`model_id`);--> statement-breakpoint
CREATE TABLE `permission_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`tool_input` blob,
	`system_reminder` text NOT NULL,
	`suggestion` blob,
	`status` text DEFAULT 'pending' NOT NULL,
	`entry` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `provider_config` (
	`provider_id` text PRIMARY KEY NOT NULL,
	`credentials` blob NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`questions` blob NOT NULL,
	`answers` blob,
	`status` text DEFAULT 'pending' NOT NULL,
	`tool_call_id` text NOT NULL,
	`message_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`answered_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`parent_session_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
