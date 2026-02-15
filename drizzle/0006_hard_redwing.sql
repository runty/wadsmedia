ALTER TABLE `messages` ADD `group_chat_id` text;--> statement-breakpoint
CREATE INDEX `idx_messages_group_chat_id` ON `messages`(`group_chat_id`);