import { describe, expect, it } from "vitest";

import { hasData, seedDemoData } from "@/server/demo-seed";
import { AppError } from "@/server/errors";
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  renameCategory,
  setProductArchived,
  updateProduct,
} from "@/server/services/catalog";
import { createCustomer, deleteCustomer } from "@/server/services/customers";
import { removeDemoData, stats } from "@/server/services/maintenance";
import { getSale } from "@/server/services/sales";

import { sale, testDb } from "../helpers";

function appError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error("expected an AppError");
}

describe("catalog, customers and demo data", () => {
  it("T-I-24 categories: create, rename, case-insensitive unique, protected when in use", () => {
    const db = testDb();
    const c = createCategory(db, { name: "Tea" });
    const dup = appError(() => createCategory(db, { name: "tea" }));
    expect([dup.status, dup.message]).toEqual([409, 'Category "tea" already exists']);
    renameCategory(db, c.id, { name: "Teas" });
    createProduct(db, { name: "Sencha", categoryId: c.id, defaultPriceMinor: 900 });
    expect(listCategories(db)[0]).toMatchObject({ name: "Teas", productCount: 1 });
    const del = appError(() => deleteCategory(db, c.id));
    expect([del.status, del.message]).toEqual([409, "This category is used by 1 product(s). Reassign them first."]);
  });

  it("T-I-25 unique SKUs and price validation", () => {
    const db = testDb();
    createProduct(db, { name: "A", sku: "SKU-1", defaultPriceMinor: 100 });
    const dup = appError(() => createProduct(db, { name: "B", sku: "SKU-1", defaultPriceMinor: 100 }));
    expect([dup.status, dup.message]).toEqual([409, 'SKU "SKU-1" is already used by another product']);
    expect(() => createProduct(db, { name: "C", defaultPriceMinor: -1 })).toThrow();
  });

  it("T-I-26 products with sales history are archived, not deleted", () => {
    const db = testDb();
    const s = sale(db, { product: "Kept" });
    const pid = s.items[0].productId as string;
    const del = appError(() => deleteProduct(db, pid));
    expect([del.status, del.message]).toEqual([409, "This product appears in past sales. Archive it instead to keep history intact."]);
    setProductArchived(db, pid, true);
    expect(listProducts(db).map((p) => p.id)).not.toContain(pid);
    expect(listProducts(db, { includeArchived: true }).find((p) => p.id === pid)).toMatchObject({ archived: true });
    expect(getSale(db, s.id).items[0].productName).toBe("Kept");
    const unused = createProduct(db, { name: "Unused", defaultPriceMinor: 100 });
    updateProduct(db, unused.id, { name: "Unused 2", defaultPriceMinor: 200 });
    deleteProduct(db, unused.id);
    expect(listProducts(db, { includeArchived: true }).map((p) => p.id)).not.toContain(unused.id);
  });

  it("T-I-27 customers with sales cannot be deleted", () => {
    const db = testDb();
    const c = createCustomer(db, { name: "Cy" });
    sale(db, { customer: { mode: "existing", customerId: c.id } });
    const err = appError(() => deleteCustomer(db, c.id));
    expect([err.status, err.message]).toEqual([409, "This customer has 1 sale(s). Customers with history cannot be deleted."]);
  });

  it("T-I-28 demo data is tagged and removable without touching real records", () => {
    const db = testDb();
    seedDemoData(db, { now: new Date(2026, 2, 15), days: 30 });
    expect(hasData(db)).toBe(true);
    const before = stats(db);
    expect(before.sales).toBeGreaterThan(0);
    expect(before.demoSales).toBe(before.sales);
    const real = sale(db, { product: "Real product" });
    removeDemoData(db);
    expect(stats(db)).toMatchObject({ sales: 1, demoSales: 0, demoRows: 0 });
    expect(getSale(db, real.id).items[0].productName).toBe("Real product");
  });
});
