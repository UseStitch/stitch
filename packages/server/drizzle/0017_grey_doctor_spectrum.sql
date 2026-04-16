CREATE TABLE `ollama_models` (
	`id` text PRIMARY KEY NOT NULL,
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
	`updated_at` integer NOT NULL
);
