CREATE TABLE `advisors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`team` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `analyses` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`topics` text NOT NULL,
	`life_events` text NOT NULL,
	`product_interest` text NOT NULL,
	`intent_stage` text NOT NULL,
	`sentiment` text NOT NULL,
	`pain_points` text NOT NULL,
	`gaps` text NOT NULL,
	`handover` text NOT NULL,
	`summary` text NOT NULL,
	`next_best_action` text,
	`model` text,
	`rule_set_id` text,
	`message_count_analyzed` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_set_id`) REFERENCES `rule_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`conversation_id` text,
	`recommendation_id` text,
	`product_code` text NOT NULL,
	`offer` text NOT NULL,
	`suitability` text,
	`premium_annual` real,
	`status` text DEFAULT 'draft' NOT NULL,
	`signature_name` text,
	`signed_at` integer,
	`policy_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`data` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `calculations` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`conversation_id` text,
	`tool_call_id` text,
	`provider` text NOT NULL,
	`operation` text NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`status` text NOT NULL,
	`error` text,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calculations_conversation_idx` ON `calculations` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `conversation_faqs` (
	`conversation_id` text NOT NULL,
	`faq_id` text NOT NULL,
	`asked_text` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`conversation_id`, `faq_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faq_id`) REFERENCES `faq_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`locale` text DEFAULT 'de' NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`stage` text DEFAULT 'started' NOT NULL,
	`title` text,
	`is_simulated` integer DEFAULT false NOT NULL,
	`simulation_run_id` text,
	`rule_set_id` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_message_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`simulation_run_id`) REFERENCES `simulation_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rule_set_id`) REFERENCES `rule_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conversations_customer_idx` ON `conversations` (`customer_id`);--> statement-breakpoint
CREATE INDEX `conversations_last_message_idx` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`lifecycle` text DEFAULT 'anonymous' NOT NULL,
	`first_name` text,
	`last_name` text,
	`email` text,
	`phone` text,
	`birth_date` text,
	`locale` text DEFAULT 'de' NOT NULL,
	`is_simulated` integer DEFAULT false NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE INDEX `customers_lifecycle_idx` ON `customers` (`lifecycle`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`conversation_id` text,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_path` text NOT NULL,
	`doc_type` text,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`error` text,
	`page_count` integer,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `documents_customer_idx` ON `documents` (`customer_id`);--> statement-breakpoint
CREATE TABLE `extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`schema_version` integer NOT NULL,
	`fields` text NOT NULL,
	`edits` text,
	`model` text,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `faq_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`canonical_text` text NOT NULL,
	`translations` text,
	`topic` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `faq_questions_key_idx` ON `faq_questions` (`key`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`nps` integer NOT NULL,
	`comment` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `handovers` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`reason` text NOT NULL,
	`rule_ids` text NOT NULL,
	`urgency` text DEFAULT 'normal' NOT NULL,
	`preferred_channel` text,
	`preferred_time` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_advisor_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hints` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`policy_id` text,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`data` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`policy_id`) REFERENCES `policies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hints_customer_type_policy_idx` ON `hints` (`customer_id`,`type`,`policy_id`);--> statement-breakpoint
CREATE TABLE `lead_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`advisor_id` text,
	`type` text NOT NULL,
	`body` text,
	`data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lead_activities_lead_idx` ON `lead_activities` (`lead_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`conversation_id` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`score` integer NOT NULL,
	`score_breakdown` text NOT NULL,
	`priority` text NOT NULL,
	`reason_to_call` text NOT NULL,
	`talking_points` text NOT NULL,
	`product_interest` text NOT NULL,
	`estimated_annual_premium` real,
	`assigned_advisor_id` text,
	`next_action_at` integer,
	`is_simulated` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `leads_conversation_type_idx` ON `leads` (`conversation_id`,`type`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`parts` text NOT NULL,
	`metadata` text,
	`input_mode` text,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`policy_number` text,
	`insurer` text DEFAULT 'Pax' NOT NULL,
	`is_external` integer DEFAULT false NOT NULL,
	`category` text NOT NULL,
	`product_code` text,
	`product_name` text NOT NULL,
	`pillar` text,
	`status` text DEFAULT 'active' NOT NULL,
	`start_date` text,
	`end_date` text,
	`notice_date` text,
	`premium_annual` real,
	`sum_insured` real,
	`annuity_annual` real,
	`insured_person` text,
	`details` text,
	`source` text NOT NULL,
	`document_id` text,
	`application_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `policies_customer_idx` ON `policies` (`customer_id`);--> statement-breakpoint
CREATE TABLE `profile_events` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`conversation_id` text,
	`message_id` text,
	`document_id` text,
	`path` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `profile_events_customer_idx` ON `profile_events` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`completeness` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`product_code` text NOT NULL,
	`pillar` text,
	`gap` text NOT NULL,
	`headline` text NOT NULL,
	`rationale` text NOT NULL,
	`criteria` text NOT NULL,
	`parameters` text,
	`premium_annual` real,
	`premium_source` text,
	`alternatives` text,
	`status` text DEFAULT 'shown' NOT NULL,
	`rule_set_id` text,
	`model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_set_id`) REFERENCES `rule_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rule_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`lead_hints` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_by_advisor_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by_advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_sets_version_unique` ON `rule_sets` (`version`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_set_id` text NOT NULL,
	`text` text NOT NULL,
	`action` text NOT NULL,
	`product_code` text,
	`active` integer DEFAULT true NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`rule_set_id`) REFERENCES `rule_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `simulation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`concurrency` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`persona_mix` text,
	`stats` text,
	`started_by_advisor_id` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`started_by_advisor_id`) REFERENCES `advisors`(`id`) ON UPDATE no action ON DELETE no action
);
