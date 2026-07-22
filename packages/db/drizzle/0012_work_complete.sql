ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "client_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset" ADD CONSTRAINT "asset_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "asset_service_log" ADD COLUMN IF NOT EXISTS "work_type" text;
--> statement-breakpoint
ALTER TABLE "asset_service_log" ADD COLUMN IF NOT EXISTS "raw_notes" text;
--> statement-breakpoint
ALTER TABLE "asset_service_log" ADD COLUMN IF NOT EXISTS "time_entry_id" text;
--> statement-breakpoint
ALTER TABLE "asset_service_log" ADD COLUMN IF NOT EXISTS "report_markdown_storage" text;
--> statement-breakpoint
ALTER TABLE "asset_service_log" ADD COLUMN IF NOT EXISTS "report_pdf_storage" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_service_log" ADD CONSTRAINT "asset_service_log_time_entry_id_time_entry_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entry"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
