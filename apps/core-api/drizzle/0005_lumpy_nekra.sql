CREATE TABLE `ecu_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`response_addr` text NOT NULL,
	`request_addr` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`system` text,
	`confidence` real DEFAULT 0.3 NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecu_manufacturer_model_response_addr` ON `ecu_definitions` (`manufacturer`,`model`,`response_addr`);--> statement-breakpoint
-- `pid_readings` se vacia a proposito: las lecturas son efimeras y no hay valor
-- en migrar `session_id` text -> integer de filas antiguas sin sesion real asociada.
-- Se dropea ANTES de `pid_definitions` para no violar su FK (pid_def_id) durante
-- la reconstruccion: drizzle ejecuta la migracion en una transaccion y
-- `PRAGMA foreign_keys=OFF` es un no-op dentro de ella.
DROP TABLE `pid_readings`;--> statement-breakpoint
CREATE TABLE `__new_pid_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
	`manufacturer` text,
	`model` text,
	`system` text,
	`confidence` real DEFAULT 1 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_pid_definitions`("id", "mode", "pid_code", "name", "description", "formula", "unit", "data_bytes", "pid_type", "min_value", "max_value", "manufacturer", "model", "system", "confidence", "source", "created_at") SELECT "id", "mode", "pid_code", "name", "description", "formula", "unit", "data_bytes", "pid_type", "min_value", "max_value", "manufacturer", "model", NULL, "confidence", "source", "created_at" FROM `pid_definitions`;--> statement-breakpoint
DROP TABLE `pid_definitions`;--> statement-breakpoint
ALTER TABLE `__new_pid_definitions` RENAME TO `pid_definitions`;--> statement-breakpoint
CREATE UNIQUE INDEX `pid_definitions_mode_pid_manufacturer_model_unique` ON `pid_definitions` (`mode`,`pid_code`,`manufacturer`,`model`);--> statement-breakpoint
CREATE TABLE `__new_pid_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`mode` text NOT NULL,
	`pid_code` text NOT NULL,
	`pid_def_id` integer,
	`raw_hex` text NOT NULL,
	`parsed_value` real,
	`timestamp` text DEFAULT 'datetime(''now'')' NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `diagnosis_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pid_def_id`) REFERENCES `pid_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `__new_pid_readings` RENAME TO `pid_readings`;--> statement-breakpoint
CREATE INDEX `idx_pid_readings_session_id` ON `pid_readings` (`session_id`);
