CREATE TABLE `executions` (
	`id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`discovered` integer DEFAULT 0 NOT NULL,
	`cycle_max_ms` integer DEFAULT 3600000 NOT NULL,
	`interval_ms` integer DEFAULT 14400000 NOT NULL,
	`next_run_at` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`error_message` text
);
--> statement-breakpoint
DROP TABLE `discoveries`;