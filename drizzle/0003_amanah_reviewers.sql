ALTER TABLE `amanah_checks` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `amanah_checks` ADD `reviewer_role` text;--> statement-breakpoint
ALTER TABLE `amanah_checks` ADD `review_override` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `amanah_checks_review_created_idx` ON `amanah_checks` (`review_status`,`created_at`);