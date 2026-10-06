CREATE TABLE `amanah_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content_type` text NOT NULL,
	`request_json` text NOT NULL,
	`result_json` text NOT NULL,
	`analysis_status` text NOT NULL,
	`publication_status` text NOT NULL,
	`review_status` text NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`reviewed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `amanah_checks_user_created_idx` ON `amanah_checks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `nabd_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`input_json` text NOT NULL,
	`posts_json` text DEFAULT '[]' NOT NULL,
	`decisions_json` text DEFAULT '[]' NOT NULL,
	`report_json` text,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nabd_runs_user_created_idx` ON `nabd_runs` (`user_id`,`created_at`);