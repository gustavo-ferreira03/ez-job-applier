CREATE TABLE `application_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`label` text NOT NULL,
	`answer` text,
	`field_type` text,
	`options` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`linkedin_job_id` text NOT NULL,
	`status` text DEFAULT 'FOUND' NOT NULL,
	`resume_filename` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `applications_linkedin_job_id_unique` ON `applications` (`linkedin_job_id`);