CREATE TABLE `vehicle_identities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wmi` text NOT NULL,
	`manufacturer` text NOT NULL,
	`confidence` real DEFAULT 0.3 NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_identities_wmi_unique` ON `vehicle_identities` (`wmi`);