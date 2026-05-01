CREATE TABLE "asset" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"site" text NOT NULL,
	"line" text NOT NULL,
	"serial" text,
	"name" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"diff_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"parent_type" text NOT NULL,
	"parent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_link" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handover" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"as_built" text,
	"spares" text,
	"support_notes" text,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"order_index" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"read_at" timestamp with time zone,
	"data_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "procurement_request" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"need_by" timestamp with time zone,
	"sap_po_number" text,
	"sap_line_cache" text,
	"last_sap_sync_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement_request_line" (
	"id" text PRIMARY KEY NOT NULL,
	"procurement_id" text NOT NULL,
	"description" text NOT NULL,
	"quantity" text DEFAULT '1' NOT NULL,
	"unit" text,
	"est_unit_price" double precision,
	"order_index" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'active' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"asset_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"labour" double precision DEFAULT 0 NOT NULL,
	"material" double precision DEFAULT 0 NOT NULL,
	"other" double precision DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_filter" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text,
	"name" text NOT NULL,
	"kind" text DEFAULT 'todos' NOT NULL,
	"filter_json" text DEFAULT '{}' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"milestone_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"est_hours" double precision,
	"actual_hours" double precision DEFAULT 0,
	"percent_complete" double precision DEFAULT 0 NOT NULL,
	"use_derived_percent" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"assignee_id" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependency" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"predecessor_task_id" text NOT NULL,
	"type" text DEFAULT 'FS' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"todo_id" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_minutes" integer,
	"note" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'backlog' NOT NULL,
	"due_at" timestamp with time zone,
	"priority" text DEFAULT 'normal' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"assignee_id" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"global_role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_rate" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hourly_rate" double precision NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_link" ADD CONSTRAINT "document_link_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_link" ADD CONSTRAINT "document_link_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover" ADD CONSTRAINT "handover_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_request" ADD CONSTRAINT "procurement_request_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_request" ADD CONSTRAINT "procurement_request_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_request" ADD CONSTRAINT "procurement_request_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_request_line" ADD CONSTRAINT "procurement_request_line_procurement_id_procurement_request_id_fk" FOREIGN KEY ("procurement_id") REFERENCES "public"."procurement_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_asset" ADD CONSTRAINT "project_asset_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_asset" ADD CONSTRAINT "project_asset_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget" ADD CONSTRAINT "project_budget_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filter" ADD CONSTRAINT "saved_filter_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filter" ADD CONSTRAINT "saved_filter_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filter" ADD CONSTRAINT "saved_filter_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_milestone_id_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_predecessor_task_id_task_id_fk" FOREIGN KEY ("predecessor_task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_todo_id_todo_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rate" ADD CONSTRAINT "user_rate_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "handover_project" ON "handover" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "notif_user_unread" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prline_proc" ON "procurement_request_line" USING btree ("procurement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pa_proj_asset" ON "project_asset" USING btree ("project_id","asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_budget_one" ON "project_budget" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pm_project_user" ON "project_member" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "task_project" ON "task" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dep_task_pred" ON "task_dependency" USING btree ("task_id","predecessor_task_id");--> statement-breakpoint
CREATE INDEX "todo_task" ON "todo" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_org_email" ON "user" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "user_rate_user" ON "user_rate" USING btree ("user_id");