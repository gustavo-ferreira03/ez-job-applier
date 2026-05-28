ALTER TABLE `application_questions` RENAME TO `linkedin_application_questions`;--> statement-breakpoint
ALTER TABLE `applications` RENAME TO `linkedin_applications`;--> statement-breakpoint
DROP INDEX `applications_linkedin_job_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `linkedin_applications_linkedin_job_id_unique` ON `linkedin_applications` (`linkedin_job_id`);