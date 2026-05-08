ALTER TABLE "procurement_request" ADD COLUMN "organization_id" text;
ALTER TABLE "procurement_request_line" ADD COLUMN "project_id" text;

UPDATE "procurement_request" pr
SET "organization_id" = p."organization_id"
FROM "project" p
WHERE p."id" = pr."project_id";

UPDATE "procurement_request_line" pl
SET "project_id" = pr."project_id"
FROM "procurement_request" pr
WHERE pr."id" = pl."procurement_id";

ALTER TABLE "procurement_request"
  ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "procurement_request_line"
  ALTER COLUMN "project_id" SET NOT NULL;

ALTER TABLE "procurement_request"
  ADD CONSTRAINT "procurement_request_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "procurement_request_line"
  ADD CONSTRAINT "procurement_request_line_project_id_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."project"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX "prline_project" ON "procurement_request_line" USING btree ("project_id");

ALTER TABLE "procurement_request" DROP COLUMN "project_id";
ALTER TABLE "procurement_request" DROP COLUMN "task_id";
