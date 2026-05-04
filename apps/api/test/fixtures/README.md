# DBF fixtures (Elecdes BOM)

Place example **`.dbf`** files here for local testing (e.g. `NotcherXPBsum.dbf`). Large or customer-specific BOMs are usually **gitignored** or kept outside the repo.

## Import behavior

The API accepts Elecdes BOM uploads as multipart (`projectId`, `file`, optional `taskId`):

- **`POST /api/bom-dbf-import`** (used by the web UI — registered on the root app to avoid 404s with some reverse-proxy setups)
- **`POST /api/procurement/import-dbf`** (same behavior, alternate path)

1. Reads all non-deleted DBF rows.
2. Groups rows by **manufacturer**, using the first matching column name (case-insensitive):  
   `MFG`, `MANUFACTURER`, `MFRS`, `MFR`, `VENDOR`, `SUPPLIER`, `MANUF`, `MAKE`.  
   Rows with no match go to **Unknown manufacturer**.
3. Creates one **procurement (RFQ)** per manufacturer, titled `Elecdes BOM: <manufacturer>`.
4. Creates **procurement lines** with quantity from `QTY` / `QUANTITY` / …, unit from `UNIT` / `UOM`, description from part/catalog + description fields.

If your export uses different column names, extend the alias lists in `apps/api/src/lib/bomDbfImport.ts`.

## UI

On a project’s **RFQ / Procurement** panel, use **Import Elecdes BOM (.dbf)** to upload.
