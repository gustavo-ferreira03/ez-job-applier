CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`general` text NOT NULL,
	`llm` text NOT NULL,
	`advanced` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
