export type KeywordRow = { id: string; keyword: string; volume: string; adsCompetition: string };
export type KeywordMetadata = {
  provider: "google-keyword-planner";
  fileName: string;
  location: string;
  fromMonth: string;
  toMonth: string;
  network: "unknown" | "google" | "google-and-partners";
  importedAt: string;
};
export type KeywordSet = {
  kind: "keyword-set-v1";
  id: string;
  name: string;
  metadata: KeywordMetadata;
  rows: KeywordRow[];
};
export type KeywordSelection = {
  setId: string;
  setName: string;
  metadata: KeywordMetadata;
  terms: KeywordRow[]; // First term is the primary keyword. No fabricated metrics.
};
export type ColumnMapping = { keyword: number; volume: number; competition: number };
export type ParsedKeywordFile = { rows: string[][]; headerIndex: number; mapping: ColumnMapping; delimiter: string };

export const MAX_KEYWORD_ROWS = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function short(value: unknown, limit: number, required = false): value is string {
  return typeof value === "string" && value.length <= limit && (!required || !!value.trim());
}
function validRow(value: unknown): value is KeywordRow {
  return record(value) && short(value.id, 80, true) && short(value.keyword, 200, true) &&
    short(value.volume, 100) && short(value.adsCompetition, 100);
}
function validMetadata(value: unknown): value is KeywordMetadata {
  if (!record(value) || value.provider !== "google-keyword-planner" || !short(value.fileName, 250) ||
      !short(value.location, 200) || !short(value.fromMonth, 7) || !short(value.toMonth, 7) ||
      !short(value.importedAt, 40, true) || !Number.isFinite(Date.parse(value.importedAt)) ||
      !["unknown", "google", "google-and-partners"].includes(String(value.network))) return false;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/;
  return (!value.fromMonth && !value.toMonth) ||
    (month.test(value.fromMonth) && month.test(value.toMonth) && value.fromMonth <= value.toMonth);
}
export function isKeywordSet(value: unknown): value is KeywordSet {
  return record(value) && value.kind === "keyword-set-v1" && typeof value.id === "string" && UUID.test(value.id) &&
    short(value.name, 120, true) && validMetadata(value.metadata) && Array.isArray(value.rows) &&
    value.rows.length > 0 && value.rows.length <= MAX_KEYWORD_ROWS && value.rows.every(validRow) &&
    new Set(value.rows.map((row) => row.id)).size === value.rows.length;
}
export function isKeywordSelection(value: unknown): value is KeywordSelection {
  return record(value) && typeof value.setId === "string" && UUID.test(value.setId) &&
    short(value.setName, 120, true) && validMetadata(value.metadata) && Array.isArray(value.terms) &&
    value.terms.length > 0 && value.terms.length <= 5 && value.terms.every(validRow) &&
    new Set(value.terms.map((row) => row.keyword.normalize("NFKC").trim().toLowerCase())).size === value.terms.length;
}

function normalizeHeader(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}
const KEYWORD_HEADERS = ["keyword", "keywords", "keyword (by relevance)", "คีย์เวิร์ด", "คำหลัก", "คำค้นหา"];
const VOLUME_HEADERS = ["avg monthly searches", "average monthly searches", "search volume", "การค้นหาเฉลี่ยต่อเดือน", "จำนวนการค้นหาเฉลี่ยต่อเดือน", "ปริมาณการค้นหาเฉลี่ยต่อเดือน"];
const COMPETITION_HEADERS = ["competition", "การแข่งขัน", "การแข่งขันโฆษณา"];
export function guessMapping(header: string[]): ColumnMapping {
  const columns = header.map(normalizeHeader);
  return {
    keyword: columns.findIndex((value) => KEYWORD_HEADERS.includes(value)),
    volume: columns.findIndex((value) => VOLUME_HEADERS.includes(value)),
    competition: columns.findIndex((value) => COMPETITION_HEADERS.includes(value)),
  };
}

// RFC-style quoted fields: escaped quotes, CRLF and embedded line breaks.
// Bounded parsing prevents a pasted/exported file from creating an enormous table.
function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  function finishField() {
    if (row.length >= 100) throw new Error("ไฟล์มีมากกว่า 100 คอลัมน์ กรุณาส่งออกเฉพาะข้อมูลคีย์เวิร์ด");
    row.push(field.trim()); field = ""; closed = false;
  }
  function finishRow() {
    finishField();
    if (row.some((cell) => cell !== "")) rows.push(row);
    row = [];
    if (rows.length > MAX_KEYWORD_ROWS + 60) throw new Error(`รองรับสูงสุด ${MAX_KEYWORD_ROWS} คีย์เวิร์ดต่อไฟล์ กรุณาแบ่งไฟล์ก่อนนำเข้า`);
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === delimiter) finishField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      finishRow();
    } else if (char === '"' && !field.trim() && !closed) { field = ""; quoted = true; }
    else if (closed && char.trim()) throw new Error("รูปแบบเครื่องหมายคำพูดใน CSV ไม่ถูกต้อง กรุณาส่งออกไฟล์ใหม่");
    else if (!closed) field += char;
    if (field.length > 10000) throw new Error("พบช่องข้อมูลยาวเกินกำหนด กรุณาตรวจรูปแบบไฟล์");
  }
  if (quoted) throw new Error("CSV มีเครื่องหมายคำพูดที่ยังไม่ปิด กรุณาตรวจไฟล์ก่อนนำเข้า");
  if (field || row.length || closed) finishRow();
  return rows;
}

export async function readKeywordFile(file: File, selectedDelimiter = "auto"): Promise<ParsedKeywordFile> {
  if (file.size > 2 * 1024 * 1024) throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 2 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
  catch { throw new Error("อ่านภาษาในไฟล์ไม่ได้ กรุณาบันทึกเป็น CSV UTF-8 หรือไฟล์ UTF-16 จาก Keyword Planner"); }
  if (text.includes("\0")) throw new Error("รูปแบบข้อความไม่ถูกต้อง กรุณาส่งออก CSV UTF-8 หรือ UTF-16 ที่มี BOM");
  const delimiters = selectedDelimiter === "auto" ? ["\t", ",", ";"] : [selectedDelimiter];
  let best: ParsedKeywordFile | null = null;
  let bestScore = -1;
  let lastError = "ไม่พบตารางในไฟล์";
  for (const delimiter of delimiters) {
    try {
      const rows = splitDelimited(text, delimiter);
      if (rows.length < 2) continue;
      const recognized = rows.slice(0, 40).findIndex((header) => guessMapping(header).keyword >= 0);
      const headerIndex = recognized >= 0 ? recognized : rows.slice(0, 40).findIndex((header) => header.length > 1);
      if (headerIndex < 0) continue;
      const mapping = guessMapping(rows[headerIndex]);
      const score = (recognized >= 0 ? 100 : 0) + (mapping.volume >= 0 ? 20 : 0) + Math.min(rows[headerIndex].length, 19);
      if (score > bestScore) { bestScore = score; best = { rows, headerIndex, mapping, delimiter }; }
    } catch (error) { lastError = error instanceof Error ? error.message : lastError; }
  }
  if (!best) throw new Error(lastError);
  return best;
}

export function buildKeywordRows(parsed: ParsedKeywordFile, headerIndex: number, mapping: ColumnMapping) {
  const header = parsed.rows[headerIndex];
  if (!header || mapping.keyword < 0 || mapping.keyword >= header.length) throw new Error("กรุณาเลือกคอลัมน์คีย์เวิร์ด");
  const columns = [mapping.keyword, mapping.volume, mapping.competition].filter((column) => column >= 0);
  if (new Set(columns).size !== columns.length || columns.some((column) => column >= header.length)) throw new Error("กรุณาเลือกคอลัมน์ให้ถูกต้องและไม่ซ้ำกัน");
  const source = parsed.rows.slice(headerIndex + 1);
  if (source.length > MAX_KEYWORD_ROWS) throw new Error(`รองรับสูงสุด ${MAX_KEYWORD_ROWS} คีย์เวิร์ดต่อไฟล์`);
  const rows: KeywordRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let empty = 0;
  source.forEach((cells, index) => {
    const keyword = (cells[mapping.keyword] ?? "").trim();
    if (!keyword) { empty++; return; }
    const volume = mapping.volume < 0 ? "" : cells[mapping.volume] ?? "";
    const adsCompetition = mapping.competition < 0 ? "" : cells[mapping.competition] ?? "";
    if (keyword.length > 200 || volume.length > 100 || adsCompetition.length > 100) throw new Error(`ข้อมูลแถวที่ ${headerIndex + index + 2} ยาวเกินกำหนด`);
    const normalized = keyword.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
    if (seen.has(normalized)) { duplicates++; return; }
    seen.add(normalized);
    rows.push({ id: `row-${headerIndex + index + 2}`, keyword, volume, adsCompetition });
  });
  if (!rows.length) throw new Error("ไม่พบคีย์เวิร์ดใต้แถวหัวตารางที่เลือก");
  return { rows, duplicates, empty };
}

export function volumeBounds(raw: string): { low: number; high: number } | null {
  const normalized = raw.normalize("NFKC").trim().toUpperCase().replace(/[๐-๙]/g, (char) => String(char.charCodeAt(0) - 0x0e50));
  function amount(value: string): number | null {
    const match = /^(\d+(?:,\d{3})*|\d+)(\.\d+)?\s*([KM])?$/.exec(value.trim());
    if (!match || (match[2] && !match[3])) return null;
    const result = Number((match[1] + (match[2] ?? "")).replace(/,/g, "")) * (match[3] === "M" ? 1000000 : match[3] === "K" ? 1000 : 1);
    return Number.isSafeInteger(result) && result >= 0 ? result : null;
  }
  const range = normalized.split(/\s*[-–—]\s*/);
  if (range.length === 2) {
    const low = amount(range[0]); const high = amount(range[1]);
    return low !== null && high !== null && high >= low ? { low, high } : null;
  }
  const exact = amount(normalized);
  return exact === null ? null : { low: exact, high: exact };
}
