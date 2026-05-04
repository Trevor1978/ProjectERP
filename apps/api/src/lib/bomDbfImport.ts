import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DBFFile, DELETED } from "dbffile";

const MFG_ALIASES = [
  "MFG",
  "MANUFACTURER",
  "MFRS",
  "MFR",
  "VENDOR",
  "SUPPLIER",
  "MANUF",
  "MAKE",
];
const QTY_ALIASES = ["QTY", "QUANTITY", "QTY_REQ", "QTY_REQUIRED", "REQTY", "QTYREQ"];
const UNIT_ALIASES = ["UNIT", "UOM", "UNITS"];
const DESC_ALIASES = [
  "DESCRIPTION",
  "DESC",
  "PARTDESC",
  "PART_DESC",
  "NAME",
  "TITLE",
  "COMPONENT",
  "TEXT",
];
const PART_ALIASES = [
  "PART",
  "PARTNO",
  "PART_NO",
  "CATNO",
  "CAT_NO",
  "CATALOG",
  "SOURCE",
  "ITEM",
  "CODE",
];

function normKey(k: string): string {
  return k.trim().toUpperCase();
}

/** Map upper-case field name → actual DBF column name (from table header). */
function buildFieldLookupFromNames(fieldNames: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const name of fieldNames) {
    m.set(normKey(name), name);
  }
  return m;
}

function pickFromRow(
  row: Record<string, unknown>,
  lookup: Map<string, string>,
  aliases: string[],
): string | undefined {
  for (const a of aliases) {
    const orig = lookup.get(a);
    if (!orig) continue;
    const v = row[orig];
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return undefined;
}

export type BomDbfRow = {
  manufacturer: string;
  description: string;
  quantity: string;
  unit: string | null;
};

function sanitizeQty(raw: string | undefined): string {
  if (!raw) return "1";
  const t = raw.trim().replace(",", ".");
  if (!/^\d*\.?\d+$/.test(t)) return "1";
  if (t === "." || t === "") return "1";
  return t;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Build line description from Elecdes-style BOM row (max 2000 for DB). */
export function rowToLineDescription(row: Record<string, unknown>, lookup: Map<string, string>): string {
  const part = pickFromRow(row, lookup, PART_ALIASES);
  const desc = pickFromRow(row, lookup, DESC_ALIASES);
  const bits: string[] = [];
  if (part) bits.push(part);
  if (desc && desc !== part) bits.push(desc);
  const s = bits.join(" — ") || "BOM line";
  return truncate(s, 2000);
}

export function rowToBomParts(
  row: Record<string, unknown>,
  lookup: Map<string, string>,
): Omit<BomDbfRow, "manufacturer"> & { manufacturer: string } {
  const mfg =
    pickFromRow(row, lookup, MFG_ALIASES)?.trim() || "Unknown manufacturer";
  const description = rowToLineDescription(row, lookup);
  const qtyRaw = pickFromRow(row, lookup, QTY_ALIASES);
  const quantity = sanitizeQty(qtyRaw);
  const unit = pickFromRow(row, lookup, UNIT_ALIASES)?.trim() || null;
  return { manufacturer: mfg, description, quantity, unit };
}

/** Read DBF from buffer (temp file). Returns non-deleted records as plain objects. */
export async function readDbfRecordsFromBuffer(buffer: Buffer): Promise<{
  fieldNames: string[];
  records: Record<string, unknown>[];
}> {
  const path = join(tmpdir(), `bom-import-${randomUUID()}.dbf`);
  await writeFile(path, buffer);
  try {
    const dbf = await DBFFile.open(path, { readMode: "loose", encoding: "latin1" });
    const fieldNames = dbf.fields.map((f) => f.name);
    const raw = await dbf.readRecords();
    const records = raw.filter((r) => !r[DELETED]);
    return { fieldNames, records };
  } finally {
    await unlink(path).catch(() => {});
  }
}

export function groupBomRowsByManufacturer(
  records: Record<string, unknown>[],
  fieldNames: string[],
): Map<string, BomDbfRow[]> {
  if (records.length === 0) return new Map();
  const lookup = buildFieldLookupFromNames(fieldNames);
  const map = new Map<string, BomDbfRow[]>();
  for (const row of records) {
    const { manufacturer, description, quantity, unit } = rowToBomParts(row, lookup);
    const list = map.get(manufacturer) ?? [];
    list.push({ manufacturer, description, quantity, unit });
    map.set(manufacturer, list);
  }
  return map;
}

export function procurementTitleForManufacturer(mfg: string, sourceLabel = "Elecdes BOM"): string {
  const t = `${sourceLabel}: ${mfg}`;
  return truncate(t, 500);
}
