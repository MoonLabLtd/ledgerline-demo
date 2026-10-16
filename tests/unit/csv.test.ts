import { describe, it, expect } from "vitest";
import { toCsv, parseCsv, safeCell } from "@/lib/csv";

describe("csv", () => {
  it("emits a BOM-prefixed CSV that round-trips through parseCsv", () => {
    const csv = toCsv(
      ["Name", "Note"],
      [
        ["Mug", 'say "hi", ok'],
        ["Pot", "x"],
      ],
    );
    expect(csv.startsWith("\uFEFFName,Note\r\n")).toBe(true);
    expect(csv).toContain('say ""hi"", ok');
    expect(parseCsv(csv)).toEqual([
      { Name: "Mug", Note: 'say "hi", ok' },
      { Name: "Pot", Note: "x" },
    ]);
  });

  it("neutralizes CSV-injection prefixes while passing numbers and null through", () => {
    expect(safeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(safeCell("@cmd")).toBe("'@cmd");
    expect(safeCell("-1+1")).toBe("'-1+1");
    expect(safeCell(-5)).toBe(-5);
    expect(safeCell(null)).toBe("");
  });
});
