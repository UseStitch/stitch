CREATE TABLE `session_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_todos_session_id_idx` ON `session_todos` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_todos_order_idx` ON `session_todos` (`session_id`,`sort_order`);