CREATE TABLE `tool_enabled` (
	`scope` text NOT NULL,
	`identifier` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_enabled_scope_identifier_uidx` ON `tool_enabled` (`scope`,`identifier`);