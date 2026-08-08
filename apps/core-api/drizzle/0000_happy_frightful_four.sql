CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status_code` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	`duration_ms` integer,
	`user_id` integer,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `diagnosis_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer NOT NULL,
	`scenario_id` text,
	`started_at` text DEFAULT 'datetime(''now'')' NOT NULL,
	`ended_at` text,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ecus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer NOT NULL,
	`name` text NOT NULL,
	`request_addr` text NOT NULL,
	`response_addr` text NOT NULL,
	`type` text NOT NULL,
	`protocol` text DEFAULT 'CAN_11_500' NOT NULL,
	`discovered_at` text DEFAULT 'datetime(''now'')' NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`context` text,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pid_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vehicle_id` integer,
	`ecu_id` integer,
	`mode` text NOT NULL,
	`pid_code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`formula` text NOT NULL,
	`unit` text,
	`data_bytes` integer DEFAULT 1 NOT NULL,
	`pid_type` text DEFAULT 'formula' NOT NULL,
	`min_value` real,
	`max_value` real,
	`confidence` real DEFAULT 1 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ecu_id`) REFERENCES `ecus`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pid_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pid_def_id` integer,
	`session_id` text NOT NULL,
	`raw_hex` text NOT NULL,
	`parsed_value` real,
	`timestamp` text DEFAULT 'datetime(''now'')' NOT NULL,
	FOREIGN KEY (`pid_def_id`) REFERENCES `pid_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`user_type` text NOT NULL,
	`business_name` text,
	`tax_id` text,
	`address` text,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL,
	`failed_login_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vin` text NOT NULL,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`year` integer NOT NULL,
	`engine_type` text NOT NULL,
	`first_seen` text DEFAULT 'datetime(''now'')' NOT NULL,
	`last_seen` text DEFAULT 'datetime(''now'')' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_vin_unique` ON `vehicles` (`vin`);