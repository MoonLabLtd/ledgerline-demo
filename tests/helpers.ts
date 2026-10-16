import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach } from "vitest";

import { openDatabase, type DB } from "@/db/client";
import { createSale } from "@/server/services/sales";

const dbs: DB[] = [];
const dirs: string[] = [];

export function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sales-dashboard-test-"));
  dirs.push(dir);
  return dir;
}

export function testDb(file: string = path.join(tmpDir(), "test.db")): DB {
  const db = openDatabase(file);
  dbs.push(db);
  return db;
}

export function at(y: number, m: number, d: number, h = 12): number {
  return new Date(y, m - 1, d, h).getTime();
}

type SaleOverrides = Record<string, unknown> & {
  qty?: number;
  price?: number;
  cost?: number | null;
  product?: string;
  category?: string;
};

export function sale(db: DB, o: SaleOverrides = {}) {
  const { qty = 1, price = 1000, cost = null, product = "Widget", category = "Gadgets", ...rest } = o;
  return createSale(db, {
    occurredAt: at(2026, 3, 10),
    customer: { mode: "walkin" },
    paymentMethod: "card",
    status: "completed",
    items: [{ newProduct: { name: product, categoryName: category }, quantity: qty, unitPriceMinor: price, unitCostMinor: cost }],
    discountMinor: 0,
    taxRateBp: 0,
    ...rest,
  });
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    if (db.$client.open) db.$client.close();
  }
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
