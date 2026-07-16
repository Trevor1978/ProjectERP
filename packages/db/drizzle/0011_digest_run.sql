CREATE TABLE "digest_run" (
	"id" text PRIMARY KEY NOT NULL,
	"run_date" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "digest_run_date_kind" ON "digest_run" USING btree ("run_date","kind");
