CREATE TABLE `mail_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_instance_id` text NOT NULL,
	`provider` text NOT NULL,
	`email` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sync_phase` text DEFAULT 'idle' NOT NULL,
	`sync_cursor` text,
	`backfill_cursor` text,
	`last_synced_at` integer,
	`last_error` text,
	`sync_frequency_seconds` integer DEFAULT 90 NOT NULL,
	`backfill_days` integer DEFAULT 90 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "mail_accounts_provider_check" CHECK("mail_accounts"."provider" in ('gmail')),
	CONSTRAINT "mail_accounts_sync_phase_check" CHECK("mail_accounts"."sync_phase" in ('idle', 'backfill', 'incremental', 'reconciling', 'error'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_accounts_connector_instance_id_uidx` ON `mail_accounts` (`connector_instance_id`);--> statement-breakpoint
CREATE TABLE `mail_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`provider_attachment_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`local_path` text,
	`downloaded_at` integer,
	FOREIGN KEY (`message_id`) REFERENCES `mail_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_attachments_message_id_idx` ON `mail_attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `mail_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_draft_id` text,
	`to_json` text NOT NULL,
	`cc_json` text NOT NULL,
	`bcc_json` text NOT NULL,
	`subject` text NOT NULL,
	`body_text` text NOT NULL,
	`body_html` text,
	`in_reply_to_message_id` text,
	`dirty` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_drafts_account_id_idx` ON `mail_drafts` (`account_id`);--> statement-breakpoint
CREATE TABLE `mail_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_label_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`color` text,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mail_labels_kind_check" CHECK("mail_labels"."kind" in ('system', 'user'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_labels_account_provider_label_uidx` ON `mail_labels` (`account_id`,`provider_label_id`);--> statement-breakpoint
CREATE INDEX `mail_labels_account_id_idx` ON `mail_labels` (`account_id`);--> statement-breakpoint
CREATE TABLE `mail_message_labels` (
	`message_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`message_id`, `label_id`),
	FOREIGN KEY (`message_id`) REFERENCES `mail_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `mail_labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_message_labels_label_id_idx` ON `mail_message_labels` (`label_id`);--> statement-breakpoint
CREATE TABLE `mail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`from_json` text NOT NULL,
	`to_json` text NOT NULL,
	`cc_json` text NOT NULL,
	`bcc_json` text NOT NULL,
	`subject` text,
	`snippet` text DEFAULT '' NOT NULL,
	`internal_date` integer NOT NULL,
	`is_unread` integer DEFAULT false NOT NULL,
	`is_draft` integer DEFAULT false NOT NULL,
	`is_trashed` integer DEFAULT false NOT NULL,
	`hydration` text NOT NULL,
	`body_text` text,
	`body_html` text,
	`rfc_message_id` text,
	`in_reply_to` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `mail_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mail_messages_hydration_check" CHECK("mail_messages"."hydration" in ('metadata', 'full'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_messages_account_provider_message_uidx` ON `mail_messages` (`account_id`,`provider_message_id`);--> statement-breakpoint
CREATE INDEX `mail_messages_thread_internal_date_idx` ON `mail_messages` (`thread_id`,`internal_date`);--> statement-breakpoint
CREATE TABLE `mail_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`op_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mail_outbox_op_type_check" CHECK("mail_outbox"."op_type" in ('send', 'send_draft', 'trash_thread', 'untrash_thread', 'modify_labels', 'create_draft', 'update_draft', 'delete_draft')),
	CONSTRAINT "mail_outbox_status_check" CHECK("mail_outbox"."status" in ('pending', 'in_flight', 'failed', 'done'))
);
--> statement-breakpoint
CREATE INDEX `mail_outbox_account_status_next_attempt_idx` ON `mail_outbox` (`account_id`,`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `mail_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_thread_id` text NOT NULL,
	`subject` text,
	`snippet` text DEFAULT '' NOT NULL,
	`last_message_at` integer NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`has_unread` integer DEFAULT false NOT NULL,
	`has_attachments` integer DEFAULT false NOT NULL,
	`is_trashed` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_threads_account_provider_thread_uidx` ON `mail_threads` (`account_id`,`provider_thread_id`);--> statement-breakpoint
CREATE INDEX `mail_threads_account_trashed_last_message_idx` ON `mail_threads` (`account_id`,`is_trashed`,`last_message_at`);