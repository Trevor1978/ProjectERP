/** Spantec service report PDF stylesheet (ported from ServiceReports). */
export const SERVICE_REPORT_CSS = `@page {
  margin: 18mm 16mm 22mm 16mm;
}

body {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.45;
  color: #1a1a1a;
}

img {
  max-width: 180px;
  height: auto;
  margin-bottom: 12px;
}

h1 {
  color: #1e3a5f;
  font-size: 18pt;
  margin: 0 0 14px 0;
  border-bottom: 2px solid #1e3a5f;
  padding-bottom: 6px;
}

h2 {
  color: #1e3a5f;
  font-size: 12pt;
  margin-top: 18px;
  margin-bottom: 8px;
}

h3 {
  color: #333;
  font-size: 11pt;
  margin-top: 14px;
  margin-bottom: 6px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 16px 0;
  font-size: 10pt;
}

table td {
  border: 1px solid #ccc;
  padding: 6px 10px;
  vertical-align: top;
}

table td:first-child {
  width: 32%;
  font-weight: 600;
  background: #f4f6f8;
}

ul {
  margin: 4px 0 10px 0;
  padding-left: 20px;
}

li {
  margin-bottom: 4px;
}

hr {
  border: none;
  border-top: 1px solid #ccc;
  margin: 20px 0 12px 0;
}

body > p:last-of-type {
  font-size: 8.5pt;
  color: #555;
  text-align: center;
}

strong {
  color: #222;
}
`;
