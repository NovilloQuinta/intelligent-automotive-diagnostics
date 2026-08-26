CREATE TABLE `two_factor_challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `two_factor_challenges_token_hash_unique` ON `two_factor_challenges` (`token_hash`);--> statement-breakpoint
CREATE TABLE `two_factor_recovery_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_two_factor_recovery_user` ON `two_factor_recovery_codes` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `two_factor_recovery_user_code` ON `two_factor_recovery_codes` (`user_id`,`code_hash`);--> statement-breakpoint
ALTER TABLE `users` ADD `two_factor_secret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `two_factor_enabled` integer DEFAULT false NOT NULL;