CREATE TABLE `mcp_oauth_sessions` (
	`server_id` text PRIMARY KEY NOT NULL,
	`client_information` blob,
	`tokens` blob,
	`code_verifier` text,
	`discovery_state` blob,
	`state` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `mcp_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `mcp_servers` ADD `auth_status` text DEFAULT 'none' NOT NULL;