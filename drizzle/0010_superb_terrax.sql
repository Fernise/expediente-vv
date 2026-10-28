CREATE TABLE `pilot_demo_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email_normalized` text NOT NULL,
	`organization_name` text NOT NULL,
	`professional_profile` text NOT NULL,
	`property_range` text NOT NULL,
	`message` text,
	`communications_consent` integer DEFAULT false NOT NULL,
	`privacy_accepted_at` text NOT NULL,
	`source` text DEFAULT 'public_demo_form' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`notification_status` text DEFAULT 'pending' NOT NULL,
	`retention_until` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pilot_demo_requests_email_time_idx` ON `pilot_demo_requests` (`email_normalized`,`created_at`);--> statement-breakpoint
CREATE INDEX `pilot_demo_requests_status_time_idx` ON `pilot_demo_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `pilot_demo_requests_retention_idx` ON `pilot_demo_requests` (`retention_until`);