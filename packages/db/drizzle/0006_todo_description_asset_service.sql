ALTER TABLE "todo" ADD COLUMN IF NOT EXISTS "description" text;

CREATE TABLE IF NOT EXISTS "asset_service_log" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"technician_name" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "asset_service_log" ADD CONSTRAINT "asset_service_log_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "asl_asset" ON "asset_service_log" USING btree ("asset_id");
