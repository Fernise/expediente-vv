CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`template_key` text NOT NULL,
	`recipient_email` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`status` text DEFAULT 'pending_provider' NOT NULL,
	`deduplication_key` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`scheduled_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text,
	`error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_dedupe_uidx` ON `notification_deliveries` (`deduplication_key`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_org_status_idx` ON `notification_deliveries` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_entity_idx` ON `notification_deliveries` (`entity_type`,`entity_id`);