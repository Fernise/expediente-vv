CREATE TABLE `fact_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`fact_key` text NOT NULL,
	`label` text NOT NULL,
	`value_type` text NOT NULL,
	`allowed_values_json` text DEFAULT '[]' NOT NULL,
	`sensitivity` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fact_definitions_org_key_uidx` ON `fact_definitions` (`organization_id`,`fact_key`);--> statement-breakpoint
CREATE TABLE `property_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`fact_definition_id` text NOT NULL,
	`fact_key` text NOT NULL,
	`value_type` text NOT NULL,
	`text_value` text,
	`boolean_value` integer,
	`source` text DEFAULT 'declared' NOT NULL,
	`confidence` text DEFAULT 'declared' NOT NULL,
	`observed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fact_definition_id`) REFERENCES `fact_definitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `property_facts_org_property_key_uidx` ON `property_facts` (`organization_id`,`property_id`,`fact_key`);--> statement-breakpoint
CREATE INDEX `property_facts_property_idx` ON `property_facts` (`organization_id`,`property_id`);--> statement-breakpoint
CREATE TABLE `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`stable_key` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `requirements_org_key_uidx` ON `requirements` (`organization_id`,`stable_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `requirements_org_id_uidx` ON `requirements` (`organization_id`,`id`);--> statement-breakpoint
CREATE TABLE `rule_evaluation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`evaluation_id` text NOT NULL,
	`rule_version_id` text NOT NULL,
	`requirement_id` text NOT NULL,
	`result` text NOT NULL,
	`trace_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`evaluation_id`) REFERENCES `rule_evaluations`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`rule_version_id`) REFERENCES `rule_versions`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`requirement_id`) REFERENCES `requirements`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rule_evaluation_items_evaluation_idx` ON `rule_evaluation_items` (`organization_id`,`evaluation_id`);--> statement-breakpoint
CREATE TABLE `rule_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`rule_set_version_id` text NOT NULL,
	`fact_snapshot_json` text NOT NULL,
	`result_summary_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`engine_version` text NOT NULL,
	`evaluated_by` text NOT NULL,
	`evaluated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evaluated_by`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`rule_set_version_id`) REFERENCES `rule_set_versions`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_evaluations_org_id_uidx` ON `rule_evaluations` (`organization_id`,`id`);--> statement-breakpoint
CREATE INDEX `rule_evaluations_property_idx` ON `rule_evaluations` (`organization_id`,`property_id`,`evaluated_at`);--> statement-breakpoint
CREATE TABLE `rule_set_version_rules` (
	`organization_id` text NOT NULL,
	`rule_set_version_id` text NOT NULL,
	`rule_version_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `rule_set_version_id`, `rule_version_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`rule_set_version_id`) REFERENCES `rule_set_versions`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`rule_version_id`) REFERENCES `rule_versions`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_set_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`rule_set_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`label` text NOT NULL,
	`validation_status` text DEFAULT 'draft_unvalidated' NOT NULL,
	`content_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`rule_set_id`) REFERENCES `rule_sets`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_set_versions_org_set_version_uidx` ON `rule_set_versions` (`organization_id`,`rule_set_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `rule_set_versions_org_id_uidx` ON `rule_set_versions` (`organization_id`,`id`);--> statement-breakpoint
CREATE TABLE `rule_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`stable_key` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_sets_org_key_uidx` ON `rule_sets` (`organization_id`,`stable_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `rule_sets_org_id_uidx` ON `rule_sets` (`organization_id`,`id`);--> statement-breakpoint
CREATE TABLE `rule_version_sources` (
	`organization_id` text NOT NULL,
	`rule_version_id` text NOT NULL,
	`source_reference_id` text NOT NULL,
	`locator` text,
	`note` text,
	PRIMARY KEY(`organization_id`, `rule_version_id`, `source_reference_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`rule_version_id`) REFERENCES `rule_versions`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`source_reference_id`) REFERENCES `source_references`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`territory_scope` text NOT NULL,
	`effective_from` text,
	`effective_to` text,
	`review_due_at` text,
	`validation_status` text DEFAULT 'draft_unvalidated' NOT NULL,
	`condition_json` text NOT NULL,
	`outcome_json` text NOT NULL,
	`display_title` text NOT NULL,
	`display_explanation` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`rule_id`) REFERENCES `rules`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_versions_org_rule_version_uidx` ON `rule_versions` (`organization_id`,`rule_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `rule_versions_org_id_uidx` ON `rule_versions` (`organization_id`,`id`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`stable_key` text NOT NULL,
	`name` text NOT NULL,
	`requirement_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`requirement_id`) REFERENCES `requirements`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_org_key_uidx` ON `rules` (`organization_id`,`stable_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `rules_org_id_uidx` ON `rules` (`organization_id`,`id`);--> statement-breakpoint
CREATE TABLE `source_references` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`issuer` text NOT NULL,
	`title` text NOT NULL,
	`official_url` text,
	`publication_date` text,
	`consulted_at` text NOT NULL,
	`territory_scope` text NOT NULL,
	`source_type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`review_due_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_references_org_id_uidx` ON `source_references` (`organization_id`,`id`);