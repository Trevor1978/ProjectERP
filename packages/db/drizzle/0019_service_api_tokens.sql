ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "account_kind" text DEFAULT 'human' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"service_user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scopes" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_access_token" ADD CONSTRAINT "api_access_token_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "api_access_token" ADD CONSTRAINT "api_access_token_service_user_id_user_id_fk" FOREIGN KEY ("service_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "api_access_token" ADD CONSTRAINT "api_access_token_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_access_token_hash_idx" ON "api_access_token" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_access_token_org_idx" ON "api_access_token" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_access_token_service_user_idx" ON "api_access_token" USING btree ("service_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"token_id" text NOT NULL,
	"service_user_id" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"source_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_access_log" ADD CONSTRAINT "api_access_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "api_access_log" ADD CONSTRAINT "api_access_log_token_id_api_access_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_access_token"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "api_access_log" ADD CONSTRAINT "api_access_log_service_user_id_user_id_fk" FOREIGN KEY ("service_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_access_log_org_created_idx" ON "api_access_log" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_access_log_token_idx" ON "api_access_log" USING btree ("token_id");
