CREATE TABLE `conversation_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`advisor_id` text,
	`note` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conversation_flags_conversation_idx` ON `conversation_flags` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `improvement_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`problem` text NOT NULL,
	`proposal` text NOT NULL,
	`rule` text,
	`evidence` text NOT NULL,
	`occurrences` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`decided_by_advisor_id` text,
	`decided_at` integer,
	`applied_rule_set_version` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `improvement_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by_advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `improvement_proposals_run_idx` ON `improvement_proposals` (`run_id`);--> statement-breakpoint
CREATE TABLE `improvement_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`window` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`conversation_count` integer DEFAULT 0 NOT NULL,
	`stats` text,
	`summary` text,
	`model` text,
	`error` text,
	`started_by_advisor_id` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`started_by_advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `knowledge_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`version` integer NOT NULL,
	`product_code` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`filename` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_path` text NOT NULL,
	`page_count` integer,
	`status` text DEFAULT 'processing' NOT NULL,
	`sections` text,
	`error` text,
	`model` text,
	`uploaded_by_advisor_id` text,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`uploaded_by_advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `knowledge_documents_product_idx` ON `knowledge_documents` (`product_code`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_documents_entry_version_idx` ON `knowledge_documents` (`entry_id`,`version`);