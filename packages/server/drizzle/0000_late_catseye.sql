CREATE TABLE `keyboard_shortcuts` (
	`action_id` text PRIMARY KEY NOT NULL,
	`hotkey` text,
	`is_sequence` integer DEFAULT false NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Workspace' NOT NULL,
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
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`app` text NOT NULL,
	`app_path` text NOT NULL,
	`status` text DEFAULT 'detected' NOT NULL,
	`recording_file_path` text,
	`duration_secs` real,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "meetings_status_check" CHECK("meetings"."status" in ('detected', 'recording', 'completed'))
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` blob NOT NULL,
	`model_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`usage` blob,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`finish_reason` text,
	`is_summary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
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
	`tool_call_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`tool_input` blob,
	`system_reminder` text NOT NULL,
	`suggestion` blob,
	`status` text DEFAULT 'pending' NOT NULL,
	`entry` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
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
CREATE TABLE `queued_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`content` text NOT NULL,
	`attachments` blob DEFAULT '[]' NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recording_transcriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`file_path` text DEFAULT '' NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`model_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`usage` blob,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "transcription_status_check" CHECK("recording_transcriptions"."status" in ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`parent_session_id` text,
	`is_unread` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tool_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_name` text NOT NULL,
	`pattern` text,
	`permission` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_permissions_tool_pattern_idx` ON `tool_permissions` (`tool_name`,`pattern`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
