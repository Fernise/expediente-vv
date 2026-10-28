ALTER TABLE `notification_deliveries` ADD `attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `last_attempt_at` text;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `next_attempt_at` text;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD `provider_message_id` text;--> statement-breakpoint
CREATE INDEX `notification_deliveries_dispatch_idx` ON `notification_deliveries` (`status`,`next_attempt_at`,`scheduled_at`);
--> statement-breakpoint
PRAGMA optimize;
