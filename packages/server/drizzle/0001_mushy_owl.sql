CREATE TABLE `permission_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`tool_input` blob,
	`system_reminder` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`entry` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
