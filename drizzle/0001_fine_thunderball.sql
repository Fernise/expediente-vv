CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`checklist_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`explanation` text NOT NULL,
	`workflow_status` text DEFAULT 'pending' NOT NULL,
	`assignee_user_id` text,
	`due_at` text,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`checklist_id`) REFERENCES `property_checklists`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `checklist_items_checklist_idx` ON `checklist_items` (`organization_id`,`checklist_id`,`position`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`checklist_item_id` text,
	`visibility` text DEFAULT 'internal' NOT NULL,
	`body` text NOT NULL,
	`author_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`edited_at` text,
	`deleted_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_property_idx` ON `comments` (`organization_id`,`property_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`document_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`malware_scan_status` text DEFAULT 'pending' NOT NULL,
	`uploaded_by` text NOT NULL,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`supersedes_id` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`document_id`) REFERENCES `documents`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_versions_storage_key_uidx` ON `document_versions` (`storage_key`);--> statement-breakpoint
CREATE INDEX `document_versions_document_idx` ON `document_versions` (`organization_id`,`document_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`checklist_item_id` text,
	`document_type` text NOT NULL,
	`document_date` text,
	`expires_at` text,
	`workflow_status` text DEFAULT 'quarantined' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`current_version_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_org_id_uidx` ON `documents` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `documents_property_idx` ON `documents` (`organization_id`,`property_id`);--> statement-breakpoint
CREATE INDEX `documents_expiry_idx` ON `documents` (`organization_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `owners` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`phone` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owners_org_id_uidx` ON `owners` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `owners_org_name_idx` ON `owners` (`organization_id`,`display_name`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`alias` text NOT NULL,
	`internal_reference` text NOT NULL,
	`address_line` text NOT NULL,
	`island_code` text NOT NULL,
	`municipality` text NOT NULL,
	`postal_code` text NOT NULL,
	`cadastral_reference` text,
	`owner_id` text NOT NULL,
	`manager_user_id` text,
	`activity_status` text DEFAULT 'not_started' NOT NULL,
	`dossier_status` text DEFAULT 'incomplete' NOT NULL,
	`next_action` text,
	`next_action_due_at` text,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`manager_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`owner_id`) REFERENCES `owners`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `properties_org_id_uidx` ON `properties` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `properties_org_status_idx` ON `properties` (`organization_id`,`dossier_status`);--> statement-breakpoint
CREATE INDEX `properties_org_island_idx` ON `properties` (`organization_id`,`island_code`);--> statement-breakpoint
CREATE INDEX `properties_org_manager_idx` ON `properties` (`organization_id`,`manager_user_id`);--> statement-breakpoint
CREATE TABLE `property_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`rule_version_label` text NOT NULL,
	`validation_status` text DEFAULT 'draft_unvalidated' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`generated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`generated_by` text NOT NULL,
	`engine_version` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generated_by`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_checklists_org_id_uidx` ON `property_checklists` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `property_checklists_property_idx` ON `property_checklists` (`organization_id`,`property_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_property_access_grants` (
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_role` text NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`granted_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`organization_id`, `property_id`, `user_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_property_access_grants`("organization_id", "property_id", "user_id", "access_role", "expires_at", "revoked_at", "granted_by", "created_at") SELECT "organization_id", "property_id", "user_id", "access_role", "expires_at", "revoked_at", "granted_by", "created_at" FROM `property_access_grants`;--> statement-breakpoint
DROP TABLE `property_access_grants`;--> statement-breakpoint
ALTER TABLE `__new_property_access_grants` RENAME TO `property_access_grants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `property_access_user_idx` ON `property_access_grants` (`user_id`);