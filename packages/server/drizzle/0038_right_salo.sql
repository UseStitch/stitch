-- Migrate existing rows: merge chat-specific columns into metadata JSON
UPDATE `llm_usage_events`
SET `metadata` = json_patch(
  COALESCE(`metadata`, '{}'),
  json_object(
    'source', `source`,
    'sessionId', `session_id`,
    'messageId', `message_id`,
    'stepIndex', `step_index`,
    'attemptIndex', `attempt_index`
  )
)
WHERE `session_id` IS NOT NULL OR `message_id` IS NOT NULL OR `step_index` IS NOT NULL OR `attempt_index` IS NOT NULL;--> statement-breakpoint
-- Ensure all rows without metadata have at least a source field
UPDATE `llm_usage_events`
SET `metadata` = json_object('source', `source`)
WHERE `metadata` IS NULL;--> statement-breakpoint
DROP INDEX `llm_usage_events_run_id_idx`;--> statement-breakpoint
ALTER TABLE `llm_usage_events` DROP COLUMN `run_id`;--> statement-breakpoint
ALTER TABLE `llm_usage_events` DROP COLUMN `is_attributable`;--> statement-breakpoint
ALTER TABLE `llm_usage_events` DROP COLUMN `session_id`;--> statement-breakpoint
ALTER TABLE `llm_usage_events` DROP COLUMN `message_id`;--> statement-breakpoint
ALTER TABLE `llm_usage_events` DROP COLUMN `step_index`;--> statement-breakpoint
ALTER TABLE `llm_usage_events` DROP COLUMN `attempt_index`;