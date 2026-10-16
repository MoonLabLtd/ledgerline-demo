import Papa from "papaparse";

const INJECTION_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export function safeCell(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  const value = String(v);
  return INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const data = rows.map((row) => row.map(safeCell));
  return `\uFEFF${Papa.unparse({ fields: headers, data }, { newline: "\r\n" })}`;
}

export function csvResponse(filename: string, csv: string): Response {
  const sanitized = filename.replace(/[^A-Za-z0-9_.-]/g, "_");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${sanitized}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const result = Papa.parse<Record<string, string>>(clean, { header: true, skipEmptyLines: true });
  return result.data;
}
