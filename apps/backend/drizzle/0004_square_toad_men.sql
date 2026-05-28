CREATE TABLE `discoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`config` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`discovered` integer DEFAULT 0 NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	`error_message` text
);
