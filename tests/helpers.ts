import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect } from "vitest";

import { openDatabase, type DB } from "@/db/client";
import { AppError } from "@/server/errors";
import { createSale, type SaleWithItems } from "@/server/services/sales";
import { ZodError } from "zod";
import type { CustomerInput, SaleInput } from "@/lib/validation";

const dbRegistry: DB[] = [];
const dirRegistry: string[] = [];

/** Creates a fresh temp directory registered for cleanup. */
export function tmpDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sales-dashboard-test-"));
  dirRegistry.push(dir);
  return dir;
}

/** Opens a real SQLite database (migrated) registered for cleanup. */
export function testDb(file = path.join(tmpDir(), "test.db")): DB {
  const db = openDatabase(file);
  dbRegistry.push(db);
  return db;
}

/** Local-time timestamp helper: `new Date(y, m - 1, d, h)`. */
export function at(y: number, m: number, d: number, h = 12): number {
  return new Date(y, m - 1, d, h).getTime();
}

export type SaleOverrides = {
  occurredAt?: number;
  orderRef?: string | null;
  customer?: CustomerInput;
  paymentMethod?: SaleInput["paymentMethod"];
  status?: SaleInput["status"];
  items?: SaleInput["items"];
  discountMinor?: number;
  taxRateBp?: number;
  notes?: string | null;
  item?: { product?: string; category?: string; qty?: number; price?: number; cost?: number | null };
};

/** Creates a sale with the canonical defaults; overrides are spread over the input. */
export function sale(db: DB, overrides: SaleOverrides = {}): SaleWithItems {
  const { item, items: itemList, ...rest } = overrides;
  const itemInput: SaleInput["items"][number] = {
    productId: null,
    newProduct: { name: item?.product ?? "Widget", categoryName: item?.category ?? "Gadgets", sku: null },
    quantity: item?.qty ?? 1,
    unitPriceMinor: item?.price ?? 1000,
    unitCostMinor: item?.cost === undefined ? null : item.cost,
  };
  return createSale(db, {
    occurredAt: rest.occurredAt ?? at(2026, 3, 10),
    orderRef: rest.orderRef ?? null,
    customer: (rest.customer ?? { mode: "walkin" }) as CustomerInput,
    paymentMethod: rest.paymentMethod ?? "card",
    status: rest.status ?? "completed",
    items: itemList ?? [itemInput],
    discountMinor: rest.discountMinor ?? 0,
    taxRateBp: rest.taxRateBp ?? 0,
    notes: rest.notes ?? null,
  });
}

/** Asserts the exact `AppError` status code and message produced by `fn`. */
export function expectAppError(fn: () => void, status: number, message: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  if (caught instanceof AppError) {
    expect(caught.status).toBe(status);
    expect(caught.message).toBe(message);
  }
}

/** Asserts that `fn` throws a Zod schema validation error. */
export function expectZodError(fn: () => void): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ZodError);
}

/** Row count via raw SQL for atomicity/cleanup assertions. */
export function countRows(db: DB, table: "sales" | "sale_items" | "products" | "customers"): number {
  const row = db.$client.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

afterEach(() => {
  for (const db of dbRegistry) {
    if (db.$client.open) {
      db.$client.close();
    }
  }
  for (const dir of dirRegistry) {
    rmSync(dir, { recursive: true, force: true });
  }
  dbRegistry.length = 0;
  dirRegistry.length = 0;
});
