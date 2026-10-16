import { describe, it, expect } from "vitest";
import { resolveRange, previousRange, autoBucket, bucketKeys } from "@/lib/date-range";

const now = new Date(2026, 2, 15, 14, 30);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe("date-range", () => {
  it("resolves all six presets against now", () => {
    expect(resolveRange({ preset: "today" }, now)).toEqual({ from: day(2026, 3, 15), to: day(2026, 3, 16) });
    expect(resolveRange({ preset: "7d" }, now)).toEqual({ from: day(2026, 3, 9), to: day(2026, 3, 16) });
    expect(resolveRange({ preset: "30d" }, now)).toEqual({ from: day(2026, 2, 14), to: day(2026, 3, 16) });
    expect(resolveRange({ preset: "thisMonth" }, now)).toEqual({ from: day(2026, 3, 1), to: day(2026, 3, 16) });
    expect(resolveRange({ preset: "prevMonth" }, now)).toEqual({ from: day(2026, 2, 1), to: day(2026, 3, 1) });
    expect(resolveRange({ preset: "thisYear" }, now)).toEqual({ from: day(2026, 1, 1), to: day(2026, 3, 16) });
  });

  it("resolves a custom range and swapped bounds to the same inclusive range", () => {
    expect(resolveRange({ preset: "custom", customFrom: "2026-01-05", customTo: "2026-01-10" }, now)).toEqual({
      from: day(2026, 1, 5),
      to: day(2026, 1, 11),
    });
    expect(resolveRange({ preset: "custom", customFrom: "2026-01-10", customTo: "2026-01-05" }, now)).toEqual({
      from: day(2026, 1, 5),
      to: day(2026, 1, 11),
    });
  });

  it("shifts a range to the immediately preceding window", () => {
    expect(previousRange({ from: day(2026, 3, 9), to: day(2026, 3, 16) })).toEqual({
      from: day(2026, 3, 2),
      to: day(2026, 3, 9),
    });
  });

  it("selects a bucket granularity based on range length", () => {
    expect(autoBucket(resolveRange({ preset: "30d" }, now))).toBe("day");
    expect(autoBucket({ from: day(2025, 12, 1), to: day(2026, 3, 1) })).toBe("week");
    expect(autoBucket(resolveRange({ preset: "custom", customFrom: "2025-01-01", customTo: "2025-12-31" }, now))).toBe("month");
  });

  it("lists bucket keys for day, week and month granularities", () => {
    expect(bucketKeys({ from: day(2026, 3, 1), to: day(2026, 3, 4) }, "day")).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"]);
    expect(bucketKeys({ from: day(2026, 3, 1), to: day(2026, 3, 10) }, "week")).toEqual(["2026-02-23", "2026-03-02", "2026-03-09"]);
    expect(bucketKeys({ from: day(2026, 1, 20), to: day(2026, 3, 2) }, "month")).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});
