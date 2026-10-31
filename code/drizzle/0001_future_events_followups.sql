CREATE TABLE `contact_preferences` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`yearly_checkin` integer DEFAULT true NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `future_events` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`conversation_id` text,
	`kind` text NOT NULL,
	`subject` text,
	`expected_date` text NOT NULL,
	`precision` text NOT NULL,
	`confidence` real NOT NULL,
	`source_quote` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`lead_id` text,
	`is_simulated` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `future_events_customer_idx` ON `future_events` (`customer_id`);--> statement-breakpoint
CREATE INDEX `future_events_status_date_idx` ON `future_events` (`status`,`expected_date`);--> statement-breakpoint
CREATE TABLE `outbox_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`kind` text NOT NULL,
	`future_event_id` text,
	`lead_id` text,
	`sequence` integer DEFAULT 1 NOT NULL,
	`to_address` text NOT NULL,
	`locale` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`sent_on` text NOT NULL,
	`replied_at` integer,
	`model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`future_event_id`) REFERENCES `future_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outbox_emails_customer_idx` ON `outbox_emails` (`customer_id`);--> statement-breakpoint
CREATE INDEX `outbox_emails_event_idx` ON `outbox_emails` (`future_event_id`);