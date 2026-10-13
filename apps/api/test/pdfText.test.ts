import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { geminiFailureAction, procurementGeminiParts } from "../src/lib/gemini.ts";
import { extractPdfText, isUsefulPdfText } from "../src/lib/pdfText.ts";

function pdfDoc(objects: string): Buffer {
  return Buffer.from(`%PDF-1.4\n${objects}\n%%EOF\n`, "latin1");
}

const hexInvoice = pdfDoc(`1 0 obj
<< /Length 180 >>
stream
BT /F1 10 Tf 40 760 Td <54617820496E766F69636520323038343933333438> Tj ET
BT /F1 10 Tf 40 740 Td <5075726368617365206F72646572204E6F2E2032363536> Tj ET
BT /F1 10 Tf 40 720 Td <5041525420444645333342207174792031207063203638302E3030> Tj ET
endstream
endobj`);

assert.match(extractPdfText(hexInvoice), /Tax Invoice 208493348/);
assert.match(extractPdfText(hexInvoice), /Purchase order No\. 2656/);
assert.match(extractPdfText(hexInvoice), /PART DFE33B qty 1 pc 680\.00/);
assert.equal(isUsefulPdfText(extractPdfText(hexInvoice)), true);

const literal = Buffer.from(
  "BT /F1 12 Tf 50 700 Td (Delivery docket DN-44 Widget bracket qty 2) Tj 0 -16 Td (Second line bolt M8) Tj ET",
  "latin1",
);
const compressed = deflateSync(literal);
const flateInvoice = pdfDoc(`1 0 obj
<< /Filter /FlateDecode /Length ${compressed.length} >>
stream
${compressed.toString("latin1")}
endstream
endobj`);
const flateText = extractPdfText(flateInvoice);
assert.match(flateText, /Delivery docket DN-44 Widget bracket qty 2/);
assert.match(flateText, /Second line bolt M8/);
assert.ok(flateText.indexOf("Delivery docket") < flateText.indexOf("Second line"));

const cmap = `beginbfchar
1
<01> <00480065006C006C006F00200049006E0076006F006900630065>
endbfchar
`;
const cmapBytes = Buffer.from(cmap, "latin1");
const mapped = pdfDoc(`1 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /X /ToUnicode 2 0 R >>
endobj
2 0 obj
<< /Length ${cmapBytes.length} >>
stream
${cmap}
endstream
endobj
3 0 obj
<< /Font << /F1 1 0 R >> >>
endobj
4 0 obj
<< /Length 40 >>
stream
BT /F1 12 Tf 40 700 Td <01> Tj ET
endstream
endobj`);
assert.match(extractPdfText(mapped), /Hello Invoice/);

const tjKern = pdfDoc(`1 0 obj
<< /Length 80 >>
stream
BT /F1 12 Tf 40 700 Td [(Widget) -250 (bracket) 20 (M8)] TJ ET
endstream
endobj`);
assert.match(extractPdfText(tjKern), /Widget bracketM8|Widget bracket M8/);

const imageOnly = pdfDoc(`1 0 obj
<< /Subtype /Image /Length 12 >>
stream
not-text Tj
endstream
endobj`);
assert.equal(extractPdfText(imageOnly), "");
assert.equal(isUsefulPdfText("Page 1"), false);

const parts = procurementGeminiParts({
  notes: "",
  file: { mimeType: "application/pdf", base64: hexInvoice.toString("base64") },
  catalogs: { suppliers: [], projects: [] },
});
assert.equal(parts.usedExtractedText, true);
assert.equal(parts.parts.length, 1);
assert.equal("inlineData" in parts.parts[0]!, false);
assert.match(
  "text" in parts.parts[0]! ? parts.parts[0].text : "",
  /Tax Invoice 208493348/,
);

const imageParts = procurementGeminiParts({
  notes: "",
  file: { mimeType: "image/png", base64: Buffer.from("png").toString("base64") },
  catalogs: { suppliers: [], projects: [] },
});
assert.equal(imageParts.usedExtractedText, false);
assert.equal(imageParts.parts.length, 2);

assert.equal(
  geminiFailureAction(new Error("Gemini request timed out after 50s")),
  "next-model",
);
assert.equal(geminiFailureAction(new Error("Gemini HTTP 404: missing")), "next-model");
assert.equal(
  geminiFailureAction(new Error("Gemini HTTP 503: high demand UNAVAILABLE")),
  "next-model",
);
assert.equal(geminiFailureAction(new Error("Gemini HTTP 401: no")), "fatal");
assert.equal(geminiFailureAction(new Error("Gemini HTTP 400: bad schema")), "retry-without-schema");

const suppliers = Array.from({ length: 520 }, (_, i) => ({
  id: `s-${i}`,
  label: i === 510 ? "DFE33B Components" : `Supplier ${i}`,
}));
const capped = procurementGeminiParts({
  notes: "",
  file: { mimeType: "application/pdf", base64: hexInvoice.toString("base64") },
  catalogs: { suppliers, projects: [] },
});
const prompt = "text" in capped.parts[0]! ? capped.parts[0].text : "";
assert.match(prompt, /DFE33B Components/);
assert.equal((prompt.match(/^- s-/gm) ?? []).length, 500);

const sewPath = "/home/ubuntu/.cursor/projects/workspace/uploads/SEW_Invoice_208493348_ae17.pdf";
if (existsSync(sewPath)) {
  const sew = readFileSync(sewPath);
  const started = Date.now();
  const text = extractPdfText(sew);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `extraction took ${elapsed}ms`);
  assert.match(text, /208493348/);
  assert.match(text, /2656/);
  assert.match(text, /DFE33B/);
  assert.match(text, /Tax Invoice/);
  assert.match(text, /sew-eurodrive\.com\.au/);
  assert.equal(text.includes("com.a u"), false);
  assert.match(text, /2000 106971074|106971074/);
  const prepared = procurementGeminiParts({
    notes: "",
    file: { mimeType: "application/pdf", base64: sew.toString("base64") },
    catalogs: {
      suppliers: [{ id: "sew-1", label: "SEW-Eurodrive Pty Ltd" }],
      projects: [],
    },
  });
  assert.equal(prepared.usedExtractedText, true);
  assert.equal(prepared.parts.length, 1);
  const body = "text" in prepared.parts[0]! ? prepared.parts[0].text : "";
  assert.match(body, /208493348/);
  assert.match(body, /SEW-Eurodrive Pty Ltd/);
  assert.equal(body.includes("inlineData"), false);
  console.log(
    `SEW invoice extracted in ${elapsed}ms (${text.length} chars); invoice, PO, and part number present; Gemini request is text-only`,
  );
}

console.log("pdfText tests passed");
