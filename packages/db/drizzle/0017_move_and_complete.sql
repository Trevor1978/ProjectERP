ALTER TABLE "milestone" ADD COLUMN "completed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "completed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "task" SET "completed" = true WHERE "percent_complete" >= 100;
