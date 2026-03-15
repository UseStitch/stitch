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
