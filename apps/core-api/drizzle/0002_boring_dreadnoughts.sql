CREATE TABLE `dtc_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dtc_manufacturer_model_code` ON `dtc_definitions` (`manufacturer`,`model`,`code`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_diagnosis_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer,
	`user_id` integer,
	`scenario_id` text,
	`started_at` text DEFAULT 'datetime(''now'')' NOT NULL,
	`ended_at` text,
	`result_json` text,
	`severity` text,
	`dtc_count` integer,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_diagnosis_sessions`("id", "vehicle_id", "user_id", "scenario_id", "started_at", "ended_at", "result_json", "severity", "dtc_count") SELECT "id", "vehicle_id", "user_id", "scenario_id", "started_at", "ended_at", "result_json", "severity", "dtc_count" FROM `diagnosis_sessions`;--> statement-breakpoint
DROP TABLE `diagnosis_sessions`;--> statement-breakpoint
ALTER TABLE `__new_diagnosis_sessions` RENAME TO `diagnosis_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_diagnosis_sessions_user_started` ON `diagnosis_sessions` (`user_id`,`started_at`);--> statement-breakpoint
ALTER TABLE `pid_definitions` ADD `manufacturer` text;--> statement-breakpoint
ALTER TABLE `pid_definitions` ADD `model` text;