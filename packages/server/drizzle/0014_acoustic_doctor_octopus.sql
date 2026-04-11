CREATE TABLE `agenda_item_events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`type` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`content` text DEFAULT '' NOT NULL,
	`session_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `agenda_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agenda_item_events_type_check" CHECK("agenda_item_events"."type" in ('created', 'status_change', 'updated', 'comment'))
);
--> statement-breakpoint
CREATE INDEX `agenda_item_events_item_id_idx` ON `agenda_item_events` (`item_id`);--> statement-breakpoint
CREATE INDEX `agenda_item_events_created_at_idx` ON `agenda_item_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `agenda_items` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'todo' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`due_at` integer,
	`completed_at` integer,
	`source_session_id` text,
	`source_message_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `agenda_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agenda_items_type_check" CHECK("agenda_items"."type" in ('todo', 'reminder', 'checkup')),
	CONSTRAINT "agenda_items_status_check" CHECK("agenda_items"."status" in ('open', 'in_progress', 'done', 'cancelled')),
	CONSTRAINT "agenda_items_priority_check" CHECK("agenda_items"."priority" in ('low', 'medium', 'high', 'urgent'))
);
--> statement-breakpoint
CREATE INDEX `agenda_items_list_id_idx` ON `agenda_items` (`list_id`);--> statement-breakpoint
CREATE INDEX `agenda_items_status_idx` ON `agenda_items` (`status`);--> statement-breakpoint
CREATE INDEX `agenda_items_due_at_idx` ON `agenda_items` (`due_at`);--> statement-breakpoint
CREATE INDEX `agenda_items_created_at_idx` ON `agenda_items` (`created_at`);--> statement-breakpoint
CREATE TABLE `agenda_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`color` text,
	`position` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_lists_name_uidx` ON `agenda_lists` (`name`);--> statement-breakpoint
CREATE INDEX `agenda_lists_created_at_idx` ON `agenda_lists` (`created_at`);