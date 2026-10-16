import { describe, it, expect } from "vitest";
import { parseMoney, toMajorString, parsePercentToBp, computeSaleTotals, formatMoney, percentChange } from "@/lib/money";

describe("money", () => {
  it("parses plain and comma-grouped major amounts to minor units", () => {
    expect(parseMoney("12")).toBe(1200);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("0.07")).toBe(7);
    expect(parseMoney("1,234.56")).toBe(123456);
  });

  it("parses two-decimal amounts without floating point drift", () => {
    expect(parseMoney("0.29")).toBe(29);
    expect(parseMoney("1.15")).toBe(115);
  });

  it("returns null for malformed money input", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("1e3")).toBeNull();
    expect(parseMoney(".")).toBeNull();
  });

  it("renders minor units as a fixed two-decimal string", () => {
    expect(toMajorString(123456)).toBe("1234.56");
    expect(toMajorString(5)).toBe("0.05");
  });

  it("parses percent strings to basis points", () => {
    expect(parsePercentToBp("")).toBe(0);
    expect(parsePercentToBp("10")).toBe(1000);
    expect(parsePercentToBp("8.25")).toBe(825);
    expect(parsePercentToBp("x")).toBeNull();
  });

  it("computes a single-line sale total with round-half-up tax", () => {
    const totals = computeSaleTotals([{ quantity: 3, unitPriceMinor: 999, unitCostMinor: 400 }], 0, 1000);
    expect(totals.subtotalMinor).toBe(2997);
    expect(totals.discountMinor).toBe(0);
    expect(totals.netMinor).toBe(2997);
    expect(totals.taxMinor).toBe(300);
    expect(totals.totalMinor).toBe(3297);
    expect(totals.costMinor).toBe(1200);
  });

  it("rounds tax half-up at the cent boundary", () => {
    const down = computeSaleTotals([{ quantity: 1, unitPriceMinor: 1005, unitCostMinor: null }], 0, 500);
    expect(down.taxMinor).toBe(50);
    const up = computeSaleTotals([{ quantity: 1, unitPriceMinor: 1010, unitCostMinor: null }], 0, 500);
    expect(up.taxMinor).toBe(51);
  });

  it("allocates a proportional discount with the remainder on the last line", () => {
    const totals = computeSaleTotals(
      [
        { quantity: 1, unitPriceMinor: 1000, unitCostMinor: null },
        { quantity: 2, unitPriceMinor: 1000, unitCostMinor: null },
      ],
      100,
      1000,
    );
    expect(totals.netMinor).toBe(2900);
    expect(totals.taxMinor).toBe(290);
    expect(totals.totalMinor).toBe(3190);
    expect(totals.lines.reduce((sum, line) => sum + line.netMinor, 0)).toBe(2900);
    expect(totals.lines.map((line) => line.netMinor)).toEqual([967, 1933]);
  });

  it("propagates a null cost when any line cost is null", () => {
    const totals = computeSaleTotals(
      [
        { quantity: 1, unitPriceMinor: 500, unitCostMinor: 100 },
        { quantity: 1, unitPriceMinor: 500, unitCostMinor: null },
      ],
      0,
      0,
    );
    expect(totals.costMinor).toBeNull();
  });

  it("throws a RangeError when the discount exceeds the subtotal", () => {
    expect(() => computeSaleTotals([{ quantity: 1, unitPriceMinor: 100, unitCostMinor: null }], 101, 0)).toThrow(RangeError);
  });

  it("formats minor units as locale-aware currency", () => {
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
    expect(formatMoney(123456, "EUR", "de-DE")).toMatch(/1\.234,56\s€/);
  });

  it("computes unrounded percent change and guards against a zero baseline", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
  });
});
