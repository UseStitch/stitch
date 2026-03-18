ALTER TABLE `agents` ADD `system_prompt` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `use_base_prompt` integer DEFAULT true NOT NULL;