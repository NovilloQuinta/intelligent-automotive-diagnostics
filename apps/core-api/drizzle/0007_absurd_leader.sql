CREATE TABLE `rate_limit_counters` (
	`namespace` text NOT NULL,
	`client_key` text NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL,
	PRIMARY KEY(`namespace`, `client_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limit_counters_reset_at` ON `rate_limit_counters` (`reset_at`);