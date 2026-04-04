ALTER TABLE `automations` ADD `run_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `type` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `automation_id` text REFERENCES automations(id);