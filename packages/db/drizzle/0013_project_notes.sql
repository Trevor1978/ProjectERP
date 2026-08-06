CREATE TABLE IF NOT EXISTS "project_note" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text DEFAULT 'Untitled note' NOT NULL,
	"background" text DEFAULT 'none' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_note_page" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"page_index" integer DEFAULT 0 NOT NULL,
	"content_json" text DEFAULT '{"objects":[],"strokes":[]}' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_note_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_note" ADD CONSTRAINT "project_note_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_note" ADD CONSTRAINT "project_note_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_note_page" ADD CONSTRAINT "project_note_page_note_id_project_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."project_note"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_note_asset" ADD CONSTRAINT "project_note_asset_note_id_project_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."project_note"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_note_project_idx" ON "project_note" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_note_page_note_idx" ON "project_note_page" USING btree ("note_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_note_page_note_index" ON "project_note_page" USING btree ("note_id","page_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_note_asset_note_idx" ON "project_note_asset" USING btree ("note_id");
