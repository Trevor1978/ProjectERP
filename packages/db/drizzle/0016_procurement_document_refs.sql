ALTER TABLE "procurement_request" ADD COLUMN IF NOT EXISTS "quote_number" text;
--> statement-breakpoint
ALTER TABLE "procurement_request" ADD COLUMN IF NOT EXISTS "invoice_number" text;
--> statement-breakpoint
ALTER TABLE "procurement_request" ADD COLUMN IF NOT EXISTS "delivery_docket_numbers" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "procurement_source_document" (
	"id" text PRIMARY KEY NOT NULL,
	"procurement_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"document_type" text NOT NULL,
	"reference_number" text,
	"po_number" text,
	"notes" text,
	"receipt_json" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procurement_source_document" ADD CONSTRAINT "proc_source_doc_procurement_id_fk" FOREIGN KEY ("procurement_id") REFERENCES "public"."procurement_request"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "procurement_source_document" ADD CONSTRAINT "proc_source_doc_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "procurement_source_document" ADD CONSTRAINT "proc_source_doc_created_by_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proc_source_doc_proc" ON "procurement_source_document" ("procurement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proc_source_doc_org_ref" ON "procurement_source_document" ("organization_id", "reference_number");
