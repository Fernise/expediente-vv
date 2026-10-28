CREATE TABLE `rule_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`rule_set_version_id` text NOT NULL,
	`action` text NOT NULL,
	`note` text,
	`actor_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`rule_set_version_id`) REFERENCES `rule_set_versions`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rule_review_events_version_idx` ON `rule_review_events` (`organization_id`,`rule_set_version_id`,`created_at`);