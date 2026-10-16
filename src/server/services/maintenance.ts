import { mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { and, eq, sql } from "drizzle-orm";

import type { DB } from "@/db/client";
import { categories, customers, products, saleItems, sales } from "@/db/schema";
import { AppError } from "@/server/errors";

export type Stats = {
  sales: number;
  demoSales: number;
  products: number;
  customers: number;
  categories: number;
  demoRows: number;
};

export function stats(db: DB): Stats {
  const { n: salesCount } = db
    .select({ n: sql<number>`count(*)` })
    .from(sales)
    .get()!;
  const { n: demoSales } = db
    .select({ n: sql<number>`count(*)` })
    .from(sales)
    .where(eq(sales.isDemo, true))
    .get()!;
  const { n: productsCount } = db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .get()!;
  const { n: customersCount } = db
    .select({ n: sql<number>`count(*)` })
    .from(customers)
    .get()!;
  const { n: categoriesCount } = db
    .select({ n: sql<number>`count(*)` })
    .from(categories)
    .get()!;
  const { n: demoProducts } = db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.isDemo, true))
    .get()!;
  const { n: demoCustomers } = db
    .select({ n: sql<number>`count(*)` })
    .from(customers)
    .where(eq(customers.isDemo, true))
    .get()!;
  const { n: demoCategories } = db
    .select({ n: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.isDemo, true))
    .get()!;
  return {
    sales: salesCount,
    demoSales,
    products: productsCount,
    customers: customersCount,
    categories: categoriesCount,
    demoRows: demoSales + demoProducts + demoCustomers + demoCategories,
  };
}

export type RemoveDemoDataResult = {
  salesRemoved: number;
  productsRemoved: number;
  customersRemoved: number;
  categoriesRemoved: number;
};

export function removeDemoData(db: DB): RemoveDemoDataResult {
  return db.transaction((tx) => {
    const salesRemoved = tx.delete(sales).where(eq(sales.isDemo, true)).run().changes;
    tx.update(products)
      .set({ isDemo: false })
      .where(
        and(eq(products.isDemo, true), sql`${products.id} IN (SELECT DISTINCT product_id FROM sale_items WHERE product_id IS NOT NULL)`),
      )
      .run();
    tx.update(customers)
      .set({ isDemo: false })
      .where(
        and(eq(customers.isDemo, true), sql`${customers.id} IN (SELECT DISTINCT customer_id FROM sales WHERE customer_id IS NOT NULL)`),
      )
      .run();
    const productsRemoved = tx.delete(products).where(eq(products.isDemo, true)).run().changes;
    const customersRemoved = tx.delete(customers).where(eq(customers.isDemo, true)).run().changes;
    tx.update(categories)
      .set({ isDemo: false })
      .where(
        and(
          eq(categories.isDemo, true),
          sql`${categories.id} IN (SELECT DISTINCT category_id FROM products WHERE category_id IS NOT NULL)`,
        ),
      )
      .run();
    const categoriesRemoved = tx.delete(categories).where(eq(categories.isDemo, true)).run().changes;
    return { salesRemoved, productsRemoved, customersRemoved, categoriesRemoved };
  });
}

export function eraseAllData(db: DB): void {
  db.transaction((tx) => {
    tx.delete(saleItems).run();
    tx.delete(sales).run();
    tx.delete(products).run();
    tx.delete(customers).run();
    tx.delete(categories).run();
  });
}

export async function backupTo(db: DB, dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `sales-${stamp}.db`);
  await db.$client.backup(file);
  return path.resolve(file);
}

export function listBackups(dir: string): { name: string; size: number; createdAt: number }[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".db"))
    .map((entry) => {
      const stat = statSync(path.join(dir, entry.name));
      return { name: entry.name, size: stat.size, createdAt: stat.mtimeMs };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

const REQUIRED_TABLES = ["sales", "sale_items", "products", "customers", "categories", "settings"] as const;

export function verifyBackupFile(file: string): void {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const result = db.pragma("integrity_check");
    const value = Array.isArray(result) ? (result[0] as { integrity_check?: string } | undefined)?.integrity_check : (result as string);
    if (value !== "ok") {
      throw new AppError(500, `Integrity check failed: ${String(value)}`);
    }
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((row) => row.name);
    for (const name of REQUIRED_TABLES) {
      if (!names.includes(name)) {
        throw new AppError(500, `Not a sales dashboard database (missing table ${name})`);
      }
    }
  } finally {
    db.close();
  }
}
