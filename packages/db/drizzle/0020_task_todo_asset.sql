ALTER TABLE "task" ADD COLUMN "asset_id" text;--> statement-breakpoint
ALTER TABLE "todo" ADD COLUMN "asset_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_asset" ON "task" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "todo_asset" ON "todo" USING btree ("asset_id");
