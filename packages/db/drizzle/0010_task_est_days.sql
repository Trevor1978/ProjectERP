ALTER TABLE "task" RENAME COLUMN "est_hours" TO "est_days";
--> statement-breakpoint
UPDATE "task" SET "est_days" = GREATEST(1, ROUND("est_days" / 8.0)) WHERE "est_days" IS NOT NULL;
