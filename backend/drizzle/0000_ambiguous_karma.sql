CREATE TABLE `linkedin_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`linkedin_job_id` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text NOT NULL,
	`url` text NOT NULL,
	`easy_apply` integer DEFAULT false NOT NULL,
	`preferences` text DEFAULT '[]' NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`about` text,
	`application_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `linkedin_jobs_linkedin_job_id_unique` ON `linkedin_jobs` (`linkedin_job_id`);