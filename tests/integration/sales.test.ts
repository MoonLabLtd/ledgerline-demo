import { describe, it, expect } from "vitest";

import type { DB } from "@/db/client";
import { createCustomer, getCustomerDetail } from "@/server/services/customers";
import { createCategory, createProduct, listProducts } from "@/server/services/catalog";
import { createSale, deleteSales, getSale, listSales, updateSale, type SaleWithItems } from "@/server/services/sales";
import { at, countRows, expectAppError, expectZodError, sale, testDb } from "../helpers";

function seedSales(db: DB): SaleWithItems[] {
  const created: SaleWithItems[] = [];
  const create = (
    orderRef: string,
    occurredAt: number,
    product: string,
    quantity: number,
    unitPriceMinor: number,
    status: string,
    paymentMethod: string,
    customer: unknown,
  ) => {
    created.push(
      createSale(db, {
        occurredAt,
        orderRef,
        customer,
        paymentMethod,
        status,
        items: [
          {
            productId: null,
            newProduct: { name: product, categoryName: null },
            quantity,
            unitPriceMinor,
            unitCostMinor: null,
          },
        ],
        discountMinor: 0,
        taxRateBp: 0,
        notes: null,
      }),
    );
  };
  create("R-1", at(2026, 3, 1), "Alpha", 1, 500, "completed", "cash", { mode: "walkin", name: null });
  create("R-2", at(2026, 3, 5), "Beta", 1, 900, "pending", "card", { mode: "walkin", name: null });
  create("R-3", at(2026, 3, 9), "Alpha", 7, 100, "completed", "card", { mode: "new", name: "Zed 100%" });
  create("R-4", at(2026, 4, 1), "Gamma", 1, 300, "refunded", "card", { mode: "walkin", name: null });
  return created;
}

describe("sales integration", () => {
  it("T-I-06: server-computed values, snapshots, and product defaults", () => {
    const db = testDb();
    const equipment = createCategory(db, { name: "Equipment" });
    const coffee = createCategory(db, { name: "Coffee" });
    const kettle = createProduct(db, {
      name: "Kettle",
      sku: null,
      categoryId: equipment.id,
      defaultPriceMinor: 2500,
      defaultCostMinor: 1000,
    });
    const beans = createProduct(db, {
      name: "Beans",
      sku: null,
      categoryId: coffee.id,
      defaultPriceMinor: 1500,
      defaultCostMinor: 1400,
    });

    const created = createSale(db, {
      occurredAt: at(2026, 3, 10),
      orderRef: null,
      customer: { mode: "walkin", name: "Ada" },
      paymentMethod: "card",
      status: "completed",
      items: [
        { productId: kettle.id, quantity: 1, unitPriceMinor: 5000, unitCostMinor: 1000 },
        { productId: beans.id, quantity: 1, unitPriceMinor: 1000, unitCostMinor: 1400 },
      ],
      discountMinor: 600,
      taxRateBp: 1000,
      notes: null,
    });

    expect(created.orderRef).toMatch(/^ORD-[0-9A-F]{8}$/);
    expect(created.subtotalMinor).toBe(6000);
    expect(created.discountMinor).toBe(600);
    expect(created.netMinor).toBe(5400);
    expect(created.taxMinor).toBe(540);
    expect(created.totalMinor).toBe(5940);
    expect(created.costMinor).toBe(2400);
    expect(created.customerName).toBe("Ada");
    expect(created.items.map((item) => [item.productName, item.categoryName, item.lineNetMinor])).toEqual([
      ["Kettle", "Equipment", 4500],
      ["Beans", "Coffee", 900],
    ]);

    const products = listProducts(db);
    const kettleRow = products.find((product) => product.name === "Kettle");
    expect(kettleRow?.defaultPriceMinor).toBe(2500);
    expect(kettleRow?.defaultCostMinor).toBe(1000);
  });

  it("T-I-07: the product-name snapshot survives a raw product rename", () => {
    const db = testDb();
    const merch = createCategory(db, { name: "Merch" });
    const mug = createProduct(db, {
      name: "Mug",
      sku: null,
      categoryId: merch.id,
      defaultPriceMinor: 2500,
      defaultCostMinor: 800,
    });
    const created = createSale(db, {
      occurredAt: at(2026, 3, 10),
      orderRef: null,
      customer: { mode: "walkin" },
      paymentMethod: "card",
      status: "completed",
      items: [{ productId: mug.id, quantity: 1, unitPriceMinor: 1200, unitCostMinor: null }],
      discountMinor: 0,
      taxRateBp: 0,
      notes: null,
    });

    db.$client.prepare("UPDATE products SET name = ? WHERE id = ?").run("Pot", mug.id);

    const reread = getSale(db, created.id);
    expect(reread.items[0].productName).toBe("Mug");
    expect(reread.items[0].unitPriceMinor).toBe(1200);
  });

  it("T-I-08: updating a sale keeps the order reference and replaces the items", () => {
    const db = testDb();
    const original = sale(db);

    const updated = updateSale(db, original.id, {
      occurredAt: at(2026, 3, 12),
      orderRef: null,
      customer: { mode: "walkin" },
      paymentMethod: "card",
      status: "refunded",
      items: [
        {
          productId: null,
          newProduct: { name: "Teapot", categoryName: null },
          quantity: 1,
          unitPriceMinor: 2100,
          unitCostMinor: null,
        },
      ],
      discountMinor: 0,
      taxRateBp: 0,
      notes: null,
    });

    expect(updated.status).toBe("refunded");
    expect(updated.netMinor).toBe(2100);
    expect(updated.orderRef).toBe(original.orderRef);
    expect(updated.items).toHaveLength(1);
  });

  it("T-I-09: duplicate references and invalid inputs throw exactly", () => {
    const db = testDb();
    sale(db, { orderRef: "A-1" });

    expectAppError(() => sale(db, { orderRef: "A-1" }), 409, 'Order reference "A-1" is already used');
    expectZodError(() => sale(db, { item: { qty: 0 } }));
    expectZodError(() => sale(db, { item: { price: 1000 }, discountMinor: 5000 }));
  });

  it("T-I-10: a failing sale rolls back every row it wrote", () => {
    const db = testDb();

    expect(() =>
      createSale(db, {
        occurredAt: at(2026, 3, 10),
        orderRef: null,
        customer: { mode: "new", name: "Dana", email: null, phone: null },
        paymentMethod: "card",
        status: "completed",
        items: [{ productId: "missing", quantity: 1, unitPriceMinor: 100, unitCostMinor: null }],
        discountMinor: 0,
        taxRateBp: 0,
        notes: null,
      }),
    ).toThrow(/no longer exists/);

    expect(countRows(db, "sales")).toBe(0);
    expect(countRows(db, "products")).toBe(0);
    expect(countRows(db, "customers")).toBe(0);
  });

  it("T-I-11: deleteSales deletes sales and cascades their items", () => {
    const db = testDb();
    const first = sale(db);
    const second = sale(db);

    expect(deleteSales(db, [first.id, second.id])).toBe(2);
    expect(countRows(db, "sale_items")).toBe(0);
  });

  it("T-I-12: customer detail exposes both sales in history", () => {
    const db = testDb();
    const customer = createCustomer(db, { name: "Dana", email: null, phone: null, notes: null });
    sale(db, { customer: { mode: "existing", customerId: customer.id } });
    sale(db, { customer: { mode: "existing", customerId: customer.id } });

    const detail = getCustomerDetail(db, customer.id);
    expect(detail.history).toHaveLength(2);
  });

  it("T-I-13: an exclusive date range returns the in-range sales", () => {
    const db = testDb();
    seedSales(db);

    const { rows } = listSales(db, { from: at(2026, 3, 1, 0), to: at(2026, 3, 9, 0), sort: "date", dir: "asc", page: 0, pageSize: 25 });
    expect(rows.map((row) => row.orderRef)).toEqual(["R-1", "R-2"]);
  });

  it("T-I-14: text search and escaped wildcards", () => {
    const db = testDb();
    seedSales(db);

    const alpha = listSales(db, { q: "alpha", sort: "date", dir: "desc", page: 0, pageSize: 25 });
    expect(alpha.total).toBe(2);

    const r4 = listSales(db, { q: "R-4", sort: "date", dir: "desc", page: 0, pageSize: 25 });
    expect(r4.rows[0].orderRef).toBe("R-4");

    const hundred = listSales(db, { q: "100%", sort: "date", dir: "desc", page: 0, pageSize: 25 });
    expect(hundred.rows.map((row) => row.orderRef)).toEqual(["R-3"]);

    const literal = listSales(db, { q: "%", sort: "date", dir: "desc", page: 0, pageSize: 25 });
    expect(literal.total).toBe(1);
  });

  it("T-I-15: status and payment method filters", () => {
    const db = testDb();
    seedSales(db);

    const pending = listSales(db, { status: ["pending", "refunded"], sort: "date", dir: "desc", page: 0, pageSize: 25 });
    expect(pending.total).toBe(2);

    const cash = listSales(db, { paymentMethod: ["cash"], sort: "date", dir: "asc", page: 0, pageSize: 25 });
    expect(cash.rows.map((row) => row.orderRef)).toEqual(["R-1"]);
  });

  it("T-I-16: sorting and pagination", () => {
    const db = testDb();
    seedSales(db);

    const byAmount = listSales(db, { sort: "amount", dir: "desc", page: 0, pageSize: 25 });
    expect(byAmount.rows.map((row) => row.orderRef)).toEqual(["R-2", "R-3", "R-1", "R-4"]);

    const byQuantity = listSales(db, { sort: "quantity", dir: "desc", page: 0, pageSize: 25 });
    expect(byQuantity.rows[0].orderRef).toBe("R-3");
    expect(byQuantity.rows[0].units).toBe(7);

    const page = listSales(db, { sort: "date", dir: "desc", page: 1, pageSize: 3 });
    expect(page.total).toBe(4);
    expect(page.rows.map((row) => row.orderRef)).toEqual(["R-1"]);
  });
});
