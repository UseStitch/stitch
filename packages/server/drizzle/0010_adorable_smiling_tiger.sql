DROP TABLE `meetings`;--> statement-breakpoint
DROP TABLE `recording_transcriptions`;--> statement-breakpoint
ALTER TABLE `llm_usage_events` DROP COLUMN `meeting_id`;--> statement-breakpoint
ALTER TABLE `llm_usage_events` DROP COLUMN `transcription_id`;