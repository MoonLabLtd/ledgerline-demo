import { addDays, differenceInCalendarDays, format, startOfDay, startOfMonth, startOfWeek, startOfYear, subMonths } from "date-fns";

export const RANGE_PRESETS = ["today", "7d", "30d", "thisMonth", "prevMonth", "thisYear", "custom"] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  thisMonth: "This month",
  prevMonth: "Previous month",
  thisYear: "This year",
  custom: "Custom range",
};

export type DateRange = { from: number; to: number };

export type RangeSelection = { preset: RangePreset; customFrom?: string; customTo?: string };

export type Bucket = "day" | "week" | "month";

export function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, date);
}

export function resolveRange(sel: RangeSelection, now: Date = new Date()): DateRange {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);

  switch (sel.preset) {
    case "today":
      return { from: today.getTime(), to: tomorrow.getTime() };
    case "7d":
      return { from: addDays(tomorrow, -7).getTime(), to: tomorrow.getTime() };
    case "30d":
      return { from: addDays(tomorrow, -30).getTime(), to: tomorrow.getTime() };
    case "thisMonth":
      return { from: startOfMonth(now).getTime(), to: tomorrow.getTime() };
    case "prevMonth":
      return { from: startOfMonth(subMonths(now, 1)).getTime(), to: startOfMonth(now).getTime() };
    case "thisYear":
      return { from: startOfYear(now).getTime(), to: tomorrow.getTime() };
    case "custom": {
      if (!sel.customFrom || !sel.customTo) {
        return resolveRange({ preset: "30d" }, now);
      }
      const a = parseDay(sel.customFrom);
      const b = parseDay(sel.customTo);
      const earlier = a.getTime() <= b.getTime() ? a : b;
      const later = a.getTime() <= b.getTime() ? b : a;
      return { from: earlier.getTime(), to: addDays(later, 1).getTime() };
    }
  }
}

export function previousRange(range: DateRange): DateRange {
  const days = Math.max(1, differenceInCalendarDays(range.to, range.from));
  return { from: addDays(range.from, -days).getTime(), to: range.from };
}

export function autoBucket(range: DateRange): Bucket {
  const n = differenceInCalendarDays(range.to, range.from);
  if (n <= 31) return "day";
  if (n <= 182) return "week";
  return "month";
}

export function dayKey(d: Date | number): string {
  return format(d, "yyyy-MM-dd");
}

export function bucketKeyForDay(day: Date | number, bucket: Bucket): string {
  switch (bucket) {
    case "day":
      return dayKey(day);
    case "week":
      return dayKey(startOfWeek(day, { weekStartsOn: 1 }));
    case "month":
      return dayKey(startOfMonth(day));
  }
}

export function bucketKeys(range: DateRange, bucket: Bucket): string[] {
  const keys: string[] = [];
  const end = addDays(range.to, -1);
  let cursor = startOfDay(range.from);
  while (cursor.getTime() <= end.getTime()) {
    const key = bucketKeyForDay(cursor, bucket);
    if (keys.length === 0 || keys[keys.length - 1] !== key) {
      keys.push(key);
    }
    cursor = addDays(cursor, 1);
  }
  return keys;
}

export function formatBucketLabel(key: string, bucket: Bucket): string {
  const d = parseDay(key);
  switch (bucket) {
    case "day":
      return format(d, "MMM d");
    case "week":
      return "Wk of " + format(d, "MMM d");
    case "month":
      return format(d, "MMM yyyy");
  }
}
