/**
 * SAP read layer: on-demand refresh. Use echo mode when no SAP_DATABASE_URL.
 * Replace `fetchSapPoLines` with real driver query (HANA / ODBC / etc.).
 */
export type SapLine = {
  lineNumber: string;
  material: string;
  quantity: string;
  unit: string;
  status: string;
};

export async function fetchSapPoLines(
  poNumber: string,
): Promise<{ lines: SapLine[]; fetchedAt: string }> {
  const echo = process.env.SAP_ECHO_MODE === "true" || !process.env.SAP_DATABASE_URL;
  if (echo) {
    return {
      lines: [
        {
          lineNumber: "10",
          material: "ECHO-ITEM",
          quantity: "1",
          unit: "EA",
          status: "echo",
        },
      ],
      fetchedAt: new Date().toISOString(),
    };
  }
  // Placeholder: connect with driver and SELECT from whitelisted view
  void poNumber;
  return { lines: [], fetchedAt: new Date().toISOString() };
}
