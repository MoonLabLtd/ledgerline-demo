import { describe, it, expect } from "vitest";

import { seedDemoData } from "@/server/demo-seed";
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  renameCategory,
  setProductArchived,
} from "@/server/services/catalog";
import { removeDemoData, stats } from "@/server/services/maintenance";
import { createSale, getSale } from "@/server/services/sales";
import { at, expectAppError, sale, testDb } from "../helpers";

describe("catalog integration", () => {
  it("T-I-24: category and product creation, enriched rows, search, archived filtering", () => {
    const db = testDb();
    const drinks = createCategory(db, { name: "Drinks" });
    const snacks = createCategory(db, { name: "Snacks" });
    const cola = createProduct(db, {
      name: "Cola",
      sku: "DRK-COL",
      categoryId: drinks.id,
      defaultPriceMinor: 900,
      defaultCostMinor: 300,
    });
    createProduct(db, {
      name: "Chips",
      sku: "SNK-CHP",
      categoryId: snacks.id,
      defaultPriceMinor: 400,
      defaultCostMinor: 100,
    });
    const archivedTea = createProduct(db, {
      name: "Archived Tea",
      sku: "DRK-TEA",
      categoryId: drinks.id,
      defaultPriceMinor: 500,
      defaultCostMinor: null,
      archived: true,
    });

    sale(db, { items: [{ productId: cola.id, quantity: 2, unitPriceMinor: 900, unitCostMinor: 300 }] });
    sale(db, {
      items: [{ productId: cola.id, quantity: 1, unitPriceMinor: 900, unitCostMinor: 300 }],
      status: "pending",
    });

    const drinksRow = listCategories(db).find((category) => category.name === "Drinks");
    expect(drinksRow?.productCount).toBe(2);

    const all = listProducts(db, { includeArchived: true });
    expect(all.map((product) => product.name).sort()).toEqual(["Archived Tea", "Chips", "Cola"]);

    const visible = listProducts(db);
    expect(visible.map((product) => product.name)).not.toContain("Archived Tea");

    const search = listProducts(db, { q: "COL" });
    expect(search.map((product) => product.name)).toEqual(["Cola"]);

    const colaRow = visible.find((product) => product.name === "Cola");
    expect(colaRow?.categoryName).toBe("Drinks");
    expect(colaRow?.unitsSold).toBe(2);
    expect(colaRow?.revenueMinor).toBe(1800);

    expect(archivedTea.archived).toBe(true);
  });

  it("T-I-25: duplicate category names conflict case-insensitively; case-only rename is allowed", () => {
    const db = testDb();
    const electronics = createCategory(db, { name: "Electronics" });

    expectAppError(() => createCategory(db, { name: "ELECTRONICS" }), 409, 'Category "ELECTRONICS" already exists');

    const renamed = renameCategory(db, electronics.id, { name: "ELECTRONICS" });
    expect(renamed.name).toBe("ELECTRONICS");

    const other = renameCategory(db, electronics.id, { name: "Gadgets" });
    expect(other.name).toBe("Gadgets");

    expectAppError(() => renameCategory(db, "missing", { name: "X" }), 404, "Category not found");
    expectAppError(() => deleteCategory(db, "missing"), 404, "Category not found");
  });

  it("T-I-26: categories with any products cannot be deleted", () => {
    const db = testDb();
    const books = createCategory(db, { name: "Books" });
    const magazines = createCategory(db, { name: "Magazines" });
    const empty = createCategory(db, { name: "Empty" });
    createProduct(db, {
      name: "Novel",
      sku: "BK-001",
      categoryId: books.id,
      defaultPriceMinor: 1500,
      defaultCostMinor: 700,
    });
    createProduct(db, {
      name: "Old Issue",
      sku: "MG-001",
      categoryId: magazines.id,
      defaultPriceMinor: 300,
      defaultCostMinor: null,
      archived: true,
    });

    expectAppError(() => deleteCategory(db, books.id), 409, "This category is used by 1 product(s). Reassign them first.");
    expectAppError(() => deleteCategory(db, magazines.id), 409, "This category is used by 1 product(s). Reassign them first.");

    expect(() => deleteCategory(db, empty.id)).not.toThrow();
  });

  it("T-I-27: products in past sales cannot be deleted; archiving and SKU conflicts are exact", () => {
    const db = testDb();
    const mug = createProduct(db, {
      name: "Mug",
      sku: "MER-MUG",
      categoryId: null,
      defaultPriceMinor: 1200,
      defaultCostMinor: 400,
    });
    createProduct(db, {
      name: "Mug Jr",
      sku: "mer-mug",
      categoryId: null,
      defaultPriceMinor: 100,
      defaultCostMinor: null,
    });

    expectAppError(
      () =>
        createProduct(db, {
          name: "Dup",
          sku: "MER-MUG",
          categoryId: null,
          defaultPriceMinor: 50,
          defaultCostMinor: null,
        }),
      409,
      'SKU "MER-MUG" is already used by another product',
    );

    sale(db, { items: [{ productId: mug.id, quantity: 1, unitPriceMinor: 1200, unitCostMinor: null }] });
    expectAppError(() => deleteProduct(db, mug.id), 409, "This product appears in past sales. Archive it instead to keep history intact.");

    const archived = setProductArchived(db, mug.id, true);
    expect(archived.archived).toBe(true);
    expect(listProducts(db).map((product) => product.name)).not.toContain("Mug");

    const free = createProduct(db, {
      name: "Free",
      sku: "FR-1",
      categoryId: null,
      defaultPriceMinor: 10,
      defaultCostMinor: null,
    });
    expect(() => deleteProduct(db, free.id)).not.toThrow();
  });

  it("T-I-28: demo removal keeps real data intact", () => {
    const db = testDb();
    const seeded = seedDemoData(db, { now: new Date(2026, 2, 15), days: 30 });
    expect(seeded.products).toBe(16);
    expect(seeded.customers).toBe(20);
    expect(seeded.sales).toBeGreaterThan(0);

    const real = createSale(db, {
      occurredAt: at(2026, 3, 10),
      orderRef: null,
      customer: { mode: "walkin" },
      paymentMethod: "card",
      status: "completed",
      items: [
        {
          productId: null,
          newProduct: { name: "Real product", categoryName: "Real category" },
          quantity: 1,
          unitPriceMinor: 500,
          unitCostMinor: null,
        },
      ],
      discountMinor: 0,
      taxRateBp: 0,
      notes: null,
    });

    removeDemoData(db);

    const current = stats(db);
    expect(current.sales).toBe(1);
    expect(current.demoSales).toBe(0);
    expect(current.demoRows).toBe(0);

    expect(getSale(db, real.id).items[0].productName).toBe("Real product");
  });
});
