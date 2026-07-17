ALTER TABLE `ollama_models` RENAME TO `local_models`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_local_models` (
	`provider` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`context_window` integer DEFAULT 8192 NOT NULL,
	`input_limit` integer,
	`output_limit` integer DEFAULT 8192 NOT NULL,
	`input_cost_per_million` real DEFAULT 0 NOT NULL,
	`output_cost_per_million` real DEFAULT 0 NOT NULL,
	`cache_read_cost_per_million` real,
	`cache_write_cost_per_million` real,
	`supports_tool_calls` integer DEFAULT false NOT NULL,
	`supports_vision` integer DEFAULT false NOT NULL,
	`supports_reasoning` integer DEFAULT false NOT NULL,
	`input_modalities` blob DEFAULT '["text"]' NOT NULL,
	`output_modalities` blob DEFAULT '["text"]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_local_models`("provider", "id", "name", "context_window", "input_limit", "output_limit", "input_cost_per_million", "output_cost_per_million", "cache_read_cost_per_million", "cache_write_cost_per_million", "supports_tool_calls", "supports_vision", "supports_reasoning", "input_modalities", "output_modalities", "created_at", "updated_at") SELECT 'ollama_local', "id", "name", "context_window", "input_limit", "output_limit", "input_cost_per_million", "output_cost_per_million", "cache_read_cost_per_million", "cache_write_cost_per_million", "supports_tool_calls", "supports_vision", "supports_reasoning", "input_modalities", "output_modalities", "created_at", "updated_at" FROM `local_models`;--> statement-breakpoint
DROP TABLE `local_models`;--> statement-breakpoint
ALTER TABLE `__new_local_models` RENAME TO `local_models`;--> statement-breakpoint
PRAGMA foreign_keys=ON;