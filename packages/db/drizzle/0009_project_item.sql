CREATE TABLE IF NOT EXISTS "project_item" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"kind" text DEFAULT 'hardware' NOT NULL,
	"part_number" text,
	"description" text NOT NULL,
	"quantity" text DEFAULT '1' NOT NULL,
	"unit" text,
	"status" text DEFAULT 'specified' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_item" ADD CONSTRAINT "project_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_item_project_idx" ON "project_item" ("project_id");
--> statement-breakpoint
ALTER TABLE "procurement_request_line" ADD COLUMN IF NOT EXISTS "project_item_id" text;
--> statement-breakpoint
ALTER TABLE "procurement_request_line" ADD CONSTRAINT "procurement_request_line_project_item_id_project_item_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_item"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prline_project_item" ON "procurement_request_line" ("project_item_id");
