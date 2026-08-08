CREATE TABLE `mcp_elicitations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`server_id` text NOT NULL,
	`server_name` text NOT NULL,
	`mode` text NOT NULL,
	`message` text NOT NULL,
	`requested_schema` blob,
	`url` text,
	`external_elicitation_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`content` blob,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `mcp_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `lance_migrations`;