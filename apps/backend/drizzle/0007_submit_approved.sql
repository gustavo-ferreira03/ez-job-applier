ALTER TABLE `applications` ADD `approved` integer NOT NULL DEFAULT 0;
UPDATE `applications` SET `status` = 'READY_FOR_REVIEW', `approved` = 1 WHERE `status` = 'APPROVED';
