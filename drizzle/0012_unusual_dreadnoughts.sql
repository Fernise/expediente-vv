CREATE TABLE `operational_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`components_json` text DEFAULT '[]' NOT NULL,
	`failure_codes_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operational_runs_completed_idx` ON `operational_runs` (`completed_at`);