ALTER TABLE `linkedin_application_questions` RENAME TO `application_questions`;--> statement-breakpoint
ALTER TABLE `linkedin_applications` RENAME TO `applications`;--> statement-breakpoint
ALTER TABLE `linkedin_jobs` RENAME TO `jobs`;--> statement-breakpoint
ALTER TABLE `applications` RENAME COLUMN "linkedin_job_id" TO "job_id";--> statement-breakpoint
ALTER TABLE `jobs` RENAME COLUMN "linkedin_job_id" TO "provider";--> statement-breakpoint
ALTER TABLE `jobs` RENAME COLUMN "easy_apply" TO "external_id";--> statement-breakpoint
DROP INDEX `linkedin_applications_linkedin_job_id_unique`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`status` text DEFAULT 'FOUND' NOT NULL,
	`resume_filename` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_applications`("id", "job_id", "status", "resume_filename", "error_message", "created_at", "updated_at") SELECT "id", "job_id", "status", "resume_filename", "error_message", "created_at", "updated_at" FROM `applications`;--> statement-breakpoint
DROP TABLE `applications`;--> statement-breakpoint
ALTER TABLE `__new_applications` RENAME TO `applications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `applications_job_id_unique` ON `applications` (`job_id`);--> statement-breakpoint
DROP INDEX `linkedin_jobs_linkedin_job_id_unique`;--> statement-breakpoint
CREATE TABLE `__new_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text NOT NULL,
	`url` text NOT NULL,
	`preferences` text DEFAULT '[]' NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`about` text,
	`application_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_jobs`("id", "provider", "external_id", "title", "company", "location", "url", "preferences", "skills", "about", "application_url", "created_at", "updated_at") SELECT "id", "provider", "external_id", "title", "company", "location", "url", "preferences", "skills", "about", "application_url", "created_at", "updated_at" FROM `jobs`;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_provider_external_id_unique` ON `jobs` (`provider`,`external_id`);