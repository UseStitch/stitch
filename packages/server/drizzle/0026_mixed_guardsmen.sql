ALTER TABLE `sessions` ADD `toolset_state` blob;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `active_toolset_ids`;