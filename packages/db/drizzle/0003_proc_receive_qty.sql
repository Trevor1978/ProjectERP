ALTER TABLE "procurement_request" ADD COLUMN "fully_received_override" boolean DEFAULT false NOT NULL;
ALTER TABLE "procurement_request_line" ADD COLUMN "received_qty" integer DEFAULT 0 NOT NULL;
UPDATE "procurement_request_line" SET "received_qty" = CASE
  WHEN "received" IS NOT TRUE THEN 0
  ELSE GREATEST(
    0,
    CEILING(
      CASE
        WHEN trim("quantity") ~ '^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$' THEN CAST(trim("quantity") AS numeric)
        ELSE 1
      END
    )
  )::integer
END;
ALTER TABLE "procurement_request_line" DROP COLUMN "received";
