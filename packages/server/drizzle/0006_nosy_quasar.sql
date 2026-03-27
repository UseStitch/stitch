ALTER TABLE `agents` ADD `kind` text;--> statement-breakpoint
CREATE UNIQUE INDEX `agents_kind_idx` ON `agents` (`kind`);