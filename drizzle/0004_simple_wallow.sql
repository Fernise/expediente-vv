CREATE TABLE `invitation_property_scopes` (
	`invitation_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	PRIMARY KEY(`invitation_id`, `property_id`),
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`property_id`) REFERENCES `properties`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invitation_scopes_org_idx` ON `invitation_property_scopes` (`organization_id`);