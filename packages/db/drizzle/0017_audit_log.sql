-- Add entity_label column to existing audit_log table
ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "entity_label" text;
--> statement-breakpoint
-- Add indexes if they don't already exist
CREATE INDEX IF NOT EXISTS "audit_log_org_idx" ON "audit_log" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" USING btree ("created_at");
