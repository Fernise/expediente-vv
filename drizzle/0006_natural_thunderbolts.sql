CREATE TABLE `reminder_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_date` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`candidate_count` integer DEFAULT 0 NOT NULL,
	`active_count` integer DEFAULT 0 NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_sync_runs_org_date_uidx` ON `reminder_sync_runs` (`organization_id`,`run_date`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`kind` text NOT NULL,
	`due_at` text,
	`channel` text DEFAULT 'in_app' NOT NULL,
	`recipient_user_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`deduplication_key` text NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_dedupe_uidx` ON `reminders` (`deduplication_key`);--> statement-breakpoint
CREATE INDEX `reminders_org_status_idx` ON `reminders` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `reminders_recipient_status_idx` ON `reminders` (`recipient_user_id`,`status`);
--> statement-breakpoint
PRAGMA optimize;
