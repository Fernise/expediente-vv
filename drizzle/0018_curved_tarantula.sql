ALTER TABLE `app_users` ADD `sites_subject` text;--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_sites_subject_uidx` ON `app_users` (`sites_subject`);