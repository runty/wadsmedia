CREATE TABLE `admin_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_identity` text NOT NULL,
	`action` text NOT NULL,
	`target_user_id` integer NOT NULL,
	`target_display_name` text,
	`details` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
