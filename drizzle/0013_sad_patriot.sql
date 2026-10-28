CREATE TABLE `operational_schedule_claims` (
	`cycle` text NOT NULL,
	`bucket` text NOT NULL,
	`claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`cycle`, `bucket`)
);
--> statement-breakpoint
CREATE INDEX `operational_schedule_claims_claimed_idx` ON `operational_schedule_claims` (`claimed_at`);