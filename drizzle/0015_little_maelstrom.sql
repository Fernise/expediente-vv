CREATE TABLE `professional_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`checklist_item_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`decision` text NOT NULL,
	`observation` text NOT NULL,
	`reviewed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`invalidated_at` text,
	`invalidation_reason` text,
	`invalidated_by_version_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`checklist_item_id`) REFERENCES `checklist_items`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`document_id`) REFERENCES `documents`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`document_version_id`) REFERENCES `document_versions`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `professional_reviews_property_idx` ON `professional_reviews` (`organization_id`,`property_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `professional_reviews_item_idx` ON `professional_reviews` (`organization_id`,`checklist_item_id`,`invalidated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_items_org_id_uidx` ON `checklist_items` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_versions_org_id_uidx` ON `document_versions` (`organization_id`,`id`);