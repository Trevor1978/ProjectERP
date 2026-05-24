CREATE TABLE IF NOT EXISTS "organization_profile" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"shipping_address" text DEFAULT '' NOT NULL,
	"billing_address" text DEFAULT '' NOT NULL,
	"correspondence_address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"tax_id" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_profile" ADD CONSTRAINT "organization_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_report_image" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"include_on_reports" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_report_image" ADD CONSTRAINT "organization_report_image_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_report_image_org_idx" ON "organization_report_image" ("organization_id");
