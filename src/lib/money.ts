export const MINOR_PER_MAJOR = 100;

// Every currency is assumed to have two decimal places (minor units = cents).
// Currencies with a different exponent (for example JPY or KWD) would require a
// per-currency exponent instead of the fixed MINOR_PER_MAJOR constant.
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "SGD", "CHF", "IDR", "INR"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const MAX_UNIT_PRICE_MINOR = 1_000_000_000;
export const MAX_QUANTITY = 100_000;
export const MAX_TAX_RATE_BP = 10_000;

export type LineInput = {
  quantity: number;
  unitPriceMinor: number;
  unitCostMinor: number | null;
};

export type SaleTotals = {
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  costMinor: number | null;
  lines: {
    subtotalMinor: number;
    netMinor: number;
    costMinor: number | null;
  }[];
};

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d{0,2}))?$/;

function digitsToMinor(whole: string, fraction: string | undefined): number | null {
  const cents = (fraction ?? "").padEnd(2, "0");
  const value = Number.parseInt(`${whole}${cents}`, 10);
  return Number.isSafeInteger(value) ? value : null;
}

export function parseMoney(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) return null;
  return digitsToMinor(match[1], match[2]);
}

export function toMajorString(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / MINOR_PER_MAJOR);
  const fraction = String(abs % MINOR_PER_MAJOR).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function parsePercentToBp(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (!match) return null;
  return digitsToMinor(match[1], match[2]);
}

export function bpToPercentString(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, "");
}

export function computeSaleTotals(lines: LineInput[], discountMinor: number, taxRateBp: number): SaleTotals {
  const lineSubtotals = lines.map((line) => line.quantity * line.unitPriceMinor);
  const subtotalMinor = lineSubtotals.reduce((sum, value) => sum + value, 0);

  if (discountMinor < 0 || discountMinor > subtotalMinor) {
    throw new RangeError("Discount must be between 0 and the subtotal");
  }

  const allocations: number[] = lines.map(() => 0);
  if (subtotalMinor > 0) {
    let allocated = 0;
    for (let index = 0; index < lines.length - 1; index += 1) {
      const share = Number((BigInt(discountMinor) * BigInt(lineSubtotals[index])) / BigInt(subtotalMinor));
      allocations[index] = share;
      allocated += share;
    }
    allocations[lines.length - 1] = discountMinor - allocated;
  }

  let costSum = 0;
  const resultLines = lines.map((line, index) => {
    const lineCost = line.unitCostMinor === null ? null : line.unitCostMinor * line.quantity;
    costSum += lineCost ?? 0;
    return {
      subtotalMinor: lineSubtotals[index],
      netMinor: lineSubtotals[index] - allocations[index],
      costMinor: lineCost,
    };
  });

  const netMinor = subtotalMinor - discountMinor;
  const n = BigInt(netMinor) * BigInt(taxRateBp);
  const d = 10000n;
  const taxMinor = Number((2n * n + d) / (2n * d));
  const costMinor = lines.some((line) => line.unitCostMinor === null) ? null : costSum;

  return {
    subtotalMinor,
    discountMinor,
    netMinor,
    taxMinor,
    totalMinor: netMinor + taxMinor,
    costMinor,
    lines: resultLines,
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: number, currency: CurrencyCode, locale: string, opts?: { compact?: boolean }): string {
  const compact = opts?.compact ?? false;
  const key = `${locale}|${currency}|${compact}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(
      locale,
      compact ? { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 } : { style: "currency", currency },
    );
    formatterCache.set(key, formatter);
  }
  return formatter.format(minor / MINOR_PER_MAJOR);
}
