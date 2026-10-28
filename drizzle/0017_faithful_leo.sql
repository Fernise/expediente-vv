CREATE TABLE `evidence_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`checklist_item_id` text NOT NULL,
	`document_id` text NOT NULL,
	`sufficiency` text DEFAULT 'unassessed' NOT NULL,
	`assessed_version_id` text,
	`assessed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`checklist_item_id`) REFERENCES `checklist_items`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`document_id`) REFERENCES `documents`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_links_org_item_document_uidx` ON `evidence_links` (`organization_id`,`checklist_item_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `evidence_links_property_idx` ON `evidence_links` (`organization_id`,`property_id`);--> statement-breakpoint
CREATE INDEX `evidence_links_document_idx` ON `evidence_links` (`organization_id`,`document_id`);