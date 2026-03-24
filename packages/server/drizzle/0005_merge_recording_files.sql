ALTER TABLE `meetings` ADD `recording_file_path` text;--> statement-breakpoint
UPDATE `meetings` SET `recording_file_path` = `mic_file_path` WHERE `mic_file_path` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `meetings` DROP COLUMN `mic_file_path`;--> statement-breakpoint
ALTER TABLE `meetings` DROP COLUMN `speaker_file_path`;
