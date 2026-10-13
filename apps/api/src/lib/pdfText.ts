import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * Pull visible text out of a PDF so a purchasing document can be sent to the
 * model as text. Multi-page PDF vision calls blow the gateway time budget
 * even for a small supplier invoice.
 */

type CMap = Map<string, string>;

type PdfStream = {
  objNum: number | null;
  dict: string;
  body: Buffer;
};

type StrToken = { k: "str"; bytes: Buffer };
type NumToken = { k: "num"; v: number };
type NameToken = { k: "name"; v: string };
type ArrToken = { k: "arr"; items: Token[] };
type OpToken = { k: "op"; v: string };
type Token = StrToken | NumToken | NameToken | ArrToken | OpToken;

export function isUsefulPdfText(text: string): boolean {
  const trimmed = text.trim();
  const letters = trimmed.match(/[A-Za-z]/g)?.length ?? 0;
  const words = trimmed.match(/[A-Za-z]{3,}/g)?.length ?? 0;
  return letters >= 24 && words >= 4 && trimmed.length >= 40;
}

export function extractPdfText(pdf: Buffer): string {
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return "";
  const raw = pdf.toString("latin1");
  const streams = listStreams(raw);
  const decoded = streams.map((stream) => ({
    ...stream,
    decoded: decodeStreamBody(stream.dict, stream.body),
  }));
  const fontCmaps = fontResourceCmaps(raw, decoded);
  const pages: string[] = [];
  for (const stream of decoded) {
    if (isImageStream(stream.dict)) continue;
    if (!looksLikeContentStream(stream.decoded)) continue;
    const text = extractContentText(stream.decoded.toString("latin1"), fontCmaps);
    if (text.trim()) pages.push(text);
  }
  return normalizeExtracted(pages.join("\n"));
}

function listStreams(raw: string): PdfStream[] {
  const out: PdfStream[] = [];
  const re = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const at = match.index;
    if (at > 0 && raw[at - 1] !== "\n" && raw[at - 1] !== "\r") continue;
    if (raw.slice(Math.max(0, at - 3), at) === "end") continue;
    const start = at + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    let body = raw.slice(start, end);
    if (body.endsWith("\r\n")) body = body.slice(0, -2);
    else if (body.endsWith("\n") || body.endsWith("\r")) body = body.slice(0, -1);
    const before = raw.slice(Math.max(0, at - 4000), at);
    const dict = dictImmediatelyBefore(before);
    out.push({
      objNum: objectNumberBefore(before),
      dict,
      body: Buffer.from(body, "latin1"),
    });
  }
  return out;
}

function dictImmediatelyBefore(before: string): string {
  const close = before.lastIndexOf(">>");
  if (close < 0) return "";
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (before.startsWith(">>", i)) {
      depth++;
      i--;
      continue;
    }
    if (before.startsWith("<<", i)) {
      depth--;
      if (depth === 0) return before.slice(i, close + 2);
      i--;
    }
  }
  const open = before.lastIndexOf("<<");
  return open >= 0 ? before.slice(open, close + 2) : "";
}

function objectNumberBefore(before: string): number | null {
  const matches = [...before.matchAll(/(\d+)\s+\d+\s+obj/g)];
  if (matches.length === 0) return null;
  return Number(matches[matches.length - 1]![1]);
}

function decodeStreamBody(dict: string, body: Buffer): Buffer {
  const filterMatch = dict.match(/\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9]+)/);
  if (!filterMatch) return body;
  const names = [...filterMatch[1]!.matchAll(/\/([A-Za-z0-9]+)/g)].map((m) => m[1]!);
  let current = body;
  for (const name of names) {
    if (name !== "FlateDecode" && name !== "Fl") return Buffer.alloc(0);
    current = inflateFlate(current);
    if (current.length === 0) return current;
  }
  return current;
}

function inflateFlate(body: Buffer): Buffer {
  try {
    return inflateSync(body);
  } catch {
    try {
      return inflateRawSync(body);
    } catch {
      return Buffer.alloc(0);
    }
  }
}

function isImageStream(dict: string): boolean {
  return /\/Subtype\s*\/Image\b/.test(dict) || /\/ImageMask\b/.test(dict);
}

function looksLikeContentStream(body: Buffer): boolean {
  if (body.length === 0 || body.length > 2_000_000) return false;
  const sample = body.subarray(0, 8000);
  let weird = 0;
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126)) continue;
    weird++;
  }
  if (weird / sample.length > 0.08) return false;
  return /\b(?:Tj|TJ)\b/.test(sample.toString("latin1"));
}

function fontResourceCmaps(
  raw: string,
  streams: { objNum: number | null; decoded: Buffer }[],
): Map<string, CMap> {
  const cmapObjByFont = new Map<number, number>();
  let idx = 0;
  while (idx < raw.length) {
    const at = raw.indexOf("/ToUnicode", idx);
    if (at < 0) break;
    idx = at + 10;
    const ref = raw.slice(at, at + 48).match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (!ref) continue;
    const fontObj = objectNumberBefore(raw.slice(Math.max(0, at - 4000), at));
    if (fontObj == null) continue;
    cmapObjByFont.set(fontObj, Number(ref[1]));
  }

  const cmapByObj = new Map<number, CMap>();
  for (const stream of streams) {
    if (stream.objNum == null) continue;
    if (![...cmapObjByFont.values()].includes(stream.objNum)) continue;
    const text = stream.decoded.toString("latin1");
    if (!text.includes("beginbfchar") && !text.includes("beginbfrange")) continue;
    cmapByObj.set(stream.objNum, parseToUnicode(text));
  }

  const byName = new Map<string, CMap>();
  for (const match of raw.matchAll(/\/([A-Za-z0-9_.:-]+)\s+(\d+)\s+\d+\s+R/g)) {
    const fontObj = Number(match[2]);
    const cmapObj = cmapObjByFont.get(fontObj);
    if (cmapObj == null) continue;
    const cmap = cmapByObj.get(cmapObj);
    if (!cmap || cmap.size === 0) continue;
    byName.set(match[1]!, cmap);
  }
  return byName;
}

function parseToUnicode(cmap: string): CMap {
  const map: CMap = new Map();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(pair[1]!.toUpperCase(), utf16HexToString(pair[2]!));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1]!;
    for (const range of body.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]+)\]/g,
    )) {
      const dests = [...range[3]!.matchAll(/<([0-9A-Fa-f]+)>/g)].map((d) =>
        utf16HexToString(d[1]!),
      );
      const width = range[1]!.length;
      let code = Number.parseInt(range[1]!, 16);
      const end = Number.parseInt(range[2]!, 16);
      for (let i = 0; code <= end && i < dests.length; code++, i++) {
        map.set(code.toString(16).toUpperCase().padStart(width, "0"), dests[i]!);
      }
    }
    const scalarSrc = body.replace(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[[^\]]+\]/g,
      "",
    );
    for (const range of scalarSrc.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const width = range[1]!.length;
      const destWidth = range[3]!.length;
      let code = Number.parseInt(range[1]!, 16);
      const end = Number.parseInt(range[2]!, 16);
      let dest = Number.parseInt(range[3]!, 16);
      for (; code <= end; code++, dest++) {
        map.set(
          code.toString(16).toUpperCase().padStart(width, "0"),
          utf16HexToString(dest.toString(16).toUpperCase().padStart(destWidth, "0")),
        );
      }
    }
  }
  return map;
}

function utf16HexToString(hex: string): string {
  const cleaned = hex.replace(/\s+/g, "");
  if (cleaned.length <= 2) {
    const n = Number.parseInt(cleaned, 16);
    return Number.isFinite(n) ? String.fromCodePoint(n) : "";
  }
  let out = "";
  const padded = cleaned.length % 4 === 0 ? cleaned : cleaned.padStart(cleaned.length + (4 - (cleaned.length % 4)), "0");
  for (let i = 0; i < padded.length; i += 4) {
    const n = Number.parseInt(padded.slice(i, i + 4), 16);
    if (Number.isFinite(n)) out += String.fromCharCode(n);
  }
  return out;
}

function extractContentText(content: string, fontCmaps: Map<string, CMap>): string {
  const tokens = tokenize(content);
  const stack: Token[] = [];
  let font = "";
  let fontSize = 10;
  let x = 0;
  let y = 0;
  let freshTextObject = false;
  const lines = new Map<number, { x: number; text: string; size: number }[]>();

  const lineAt = (yy: number) => {
    const key = Math.round(yy);
    let row = lines.get(key);
    if (!row) {
      row = [];
      lines.set(key, row);
    }
    return row;
  };

  const decode = (bytes: Buffer): string => applyCmap(bytes, fontCmaps.get(font));
  const widthOf = (text: string, size: number) => text.length * size * 0.5;
  const addText = (text: string) => {
    if (!text) return;
    lineAt(y).push({ x, text, size: fontSize });
    x += widthOf(text, fontSize);
  };

  for (const tok of tokens) {
    if (tok.k !== "op") {
      stack.push(tok);
      continue;
    }
    if (tok.v === "BT") {
      freshTextObject = true;
      stack.length = 0;
      continue;
    }
    if (tok.v === "Tf") {
      const size = stack.pop();
      const name = stack.pop();
      if (name?.k === "name") font = name.v;
      if (size?.k === "num" && size.v > 0) fontSize = size.v;
      stack.length = 0;
      continue;
    }
    if (tok.v === "Td" || tok.v === "TD") {
      const ty = stack.pop();
      const tx = stack.pop();
      if (ty?.k === "num" && tx?.k === "num") {
        if (freshTextObject) {
          x = tx.v;
          y = ty.v;
        } else {
          x += tx.v;
          y += ty.v;
        }
        freshTextObject = false;
      }
      stack.length = 0;
      continue;
    }
    if (tok.v === "Tm") {
      const nums: number[] = [];
      while (stack.length > 0 && nums.length < 6) {
        const n = stack.pop();
        if (n?.k === "num") nums.push(n.v);
      }
      // Stack order is f e d c b a, so the first popped value is y and the second is x.
      if (nums.length > 0) y = nums[0]!;
      if (nums.length > 1) x = nums[1]!;
      freshTextObject = false;
      stack.length = 0;
      continue;
    }
    if (tok.v === "T*") {
      y -= 14;
      freshTextObject = false;
      stack.length = 0;
      continue;
    }
    if (tok.v === "Tj" || tok.v === "'" || tok.v === '"') {
      if (tok.v !== "Tj") y -= 14;
      const str = stack.pop();
      if (str?.k === "str") addText(decode(str.bytes));
      freshTextObject = false;
      stack.length = 0;
      continue;
    }
    if (tok.v === "TJ") {
      const arr = stack.pop();
      if (arr?.k === "arr") {
        const parts: string[] = [];
        for (const item of arr.items) {
          if (item.k === "str") parts.push(decode(item.bytes));
          else if (item.k === "num" && item.v <= -180) parts.push(" ");
        }
        addText(parts.join(""));
      }
      freshTextObject = false;
      stack.length = 0;
      continue;
    }
    stack.length = 0;
  }

  return [...lines.keys()]
    .sort((a, b) => b - a)
    .map((key) => joinLine(lines.get(key)!))
    .filter(Boolean)
    .join("\n");
}

function joinLine(chunks: { x: number; text: string; size: number }[]): string {
  const sorted = [...chunks].sort((a, b) => a.x - b.x);
  let out = "";
  let cursor = Number.NEGATIVE_INFINITY;
  for (const chunk of sorted) {
    if (out) {
      const gap = chunk.x - cursor;
      const spaceAt = Math.max(chunk.size * 0.8, 3);
      if (gap > spaceAt && !out.endsWith(" ") && !chunk.text.startsWith(" ")) out += " ";
    }
    out += chunk.text;
    cursor = Math.max(cursor, chunk.x + chunk.text.length * chunk.size * 0.5);
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

function tokenize(content: string): Token[] {
  return readTokens(content, { i: 0 }, false);
}

function readTokens(content: string, pos: { i: number }, inArray: boolean): Token[] {
  const tokens: Token[] = [];
  while (pos.i < content.length) {
    const c = content[pos.i]!;
    if (c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0") {
      pos.i++;
      continue;
    }
    if (c === "%") {
      while (pos.i < content.length && content[pos.i] !== "\n") pos.i++;
      continue;
    }
    if (c === "]") {
      pos.i++;
      if (inArray) return tokens;
      continue;
    }
    if (c === "[") {
      pos.i++;
      tokens.push({ k: "arr", items: readTokens(content, pos, true) });
      continue;
    }
    if (c === "<" && content[pos.i + 1] === "<") {
      pos.i += 2;
      let depth = 1;
      while (pos.i < content.length && depth > 0) {
        if (content.startsWith("<<", pos.i)) {
          depth++;
          pos.i += 2;
        } else if (content.startsWith(">>", pos.i)) {
          depth--;
          pos.i += 2;
        } else pos.i++;
      }
      continue;
    }
    if (c === "(") {
      const lit = readLiteral(content, pos.i);
      tokens.push({ k: "str", bytes: lit.bytes });
      pos.i = lit.next;
      continue;
    }
    if (c === "<") {
      const hex = readHex(content, pos.i);
      tokens.push({ k: "str", bytes: hex.bytes });
      pos.i = hex.next;
      continue;
    }
    if (c === "/") {
      const name = /^\/([^\s<>[\](){}/%]+)/.exec(content.slice(pos.i));
      if (name) {
        tokens.push({ k: "name", v: name[1]! });
        pos.i += name[0].length;
        continue;
      }
    }
    if (c === "+" || c === "-" || c === "." || (c >= "0" && c <= "9")) {
      const num = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(content.slice(pos.i));
      if (num) {
        tokens.push({ k: "num", v: Number(num[0]) });
        pos.i += num[0].length;
        continue;
      }
    }
    const op = /^[A-Za-z*'"']+/.exec(content.slice(pos.i));
    if (op) {
      tokens.push({ k: "op", v: op[0] });
      pos.i += op[0].length;
      continue;
    }
    pos.i++;
  }
  return tokens;
}

function readLiteral(content: string, start: number): { bytes: Buffer; next: number } {
  const bytes: number[] = [];
  let i = start + 1;
  let depth = 1;
  while (i < content.length && depth > 0) {
    const c = content[i]!;
    if (c === "\\") {
      const n = content[i + 1];
      if (n == null) break;
      if (n === "n") bytes.push(10);
      else if (n === "r") bytes.push(13);
      else if (n === "t") bytes.push(9);
      else if (n === "b") bytes.push(8);
      else if (n === "f") bytes.push(12);
      else if (n === "(" || n === ")" || n === "\\") bytes.push(n.charCodeAt(0));
      else if (n === "\n") {
        i += 2;
        continue;
      } else if (n === "\r") {
        i += content[i + 2] === "\n" ? 3 : 2;
        continue;
      } else if (n >= "0" && n <= "7") {
        let oct = n;
        let j = i + 2;
        while (j < i + 4 && j < content.length && content[j]! >= "0" && content[j]! <= "7") {
          oct += content[j];
          j++;
        }
        bytes.push(Number.parseInt(oct, 8) & 0xff);
        i = j;
        continue;
      } else bytes.push(n.charCodeAt(0));
      i += 2;
      continue;
    }
    if (c === "(") {
      depth++;
      bytes.push(c.charCodeAt(0));
      i++;
      continue;
    }
    if (c === ")") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
      bytes.push(c.charCodeAt(0));
      i++;
      continue;
    }
    bytes.push(c.charCodeAt(0) & 0xff);
    i++;
  }
  return { bytes: Buffer.from(bytes), next: i };
}

function readHex(content: string, start: number): { bytes: Buffer; next: number } {
  const end = content.indexOf(">", start + 1);
  const raw = end < 0 ? content.slice(start + 1) : content.slice(start + 1, end);
  let hex = raw.replace(/[^0-9A-Fa-f]/g, "");
  if (hex.length % 2 === 1) hex += "0";
  return {
    bytes: Buffer.from(hex, "hex"),
    next: end < 0 ? content.length : end + 1,
  };
}

function applyCmap(bytes: Buffer, cmap: CMap | undefined): string {
  if (!cmap || cmap.size === 0) return plainText(bytes);
  const widths = [...new Set([...cmap.keys()].map((key) => key.length / 2))]
    .filter((w) => w >= 1)
    .sort((a, b) => b - a);
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    let matched = false;
    for (const width of widths) {
      if (i + width > bytes.length) continue;
      const key = bytes.subarray(i, i + width).toString("hex").toUpperCase();
      const hit = cmap.get(key);
      if (hit == null) continue;
      out += hit;
      i += width;
      matched = true;
      break;
    }
    if (!matched) {
      out += plainText(bytes.subarray(i, i + 1));
      i += 1;
    }
  }
  return out;
}

function plainText(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return utf16be(bytes.subarray(2));
  }
  if (bytes.length >= 4 && bytes.length % 2 === 0 && bytes[0] === 0 && bytes[2] === 0) {
    return utf16be(bytes);
  }
  let out = "";
  for (const b of bytes) {
    if (b === 9 || b === 10 || b === 13) out += " ";
    else if (b >= 32) out += String.fromCharCode(b);
  }
  return out;
}

function utf16be(bytes: Buffer): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
  }
  return out;
}

function normalizeExtracted(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
