CREATE TABLE `agent_sub_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`provider_id` text,
	`model_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sub_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_sub_agents_agent_sub_idx` ON `agent_sub_agents` (`agent_id`,`sub_agent_id`);--> statement-breakpoint
ALTER TABLE `permission_responses` ADD `sub_agent_id` text REFERENCES agents(id);--> statement-breakpoint
ALTER TABLE `questions` ADD `sub_agent_id` text REFERENCES agents(id);