import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import type { DB } from "@/db/client";
import { salesQuerySchema } from "@/lib/validation";
import { createProduct, listProducts } from "@/server/services/catalog";
import { createCustomer, getCustomerDetail } from "@/server/services/customers";
import { createSale, deleteSales, getSale, listSales, updateSale } from "@/server/services/sales";
import { AppError } from "@/server/errors";

import { at, sale, testDb } from "../helpers";

const q = (o: Record<string, unknown>) => salesQuerySchema.parse(o);

function seed(db: DB) {
  sale(db, {
    orderRef: "R-1",
    occurredAt: at(2026, 3, 1),
    product: "Alpha",
    qty: 1,
    price: 500,
    status: "completed",
    paymentMethod: "cash",
  });
  sale(db, { orderRef: "R-2", occurredAt: at(2026, 3, 5), product: "Beta", qty: 1, price: 900, status: "pending", paymentMethod: "card" });
  sale(db, {
    orderRef: "R-3",
    occurredAt: at(2026, 3, 9),
    product: "Alpha",
    qty: 7,
    price: 100,
    status: "completed",
    paymentMethod: "card",
    customer: { mode: "new", name: "Zed 100%", phone: null },
  });
  sale(db, {
    orderRef: "R-4",
    occurredAt: at(2026, 4, 1),
    product: "Gamma",
    qty: 1,
    price: 300,
    status: "refunded",
    paymentMethod: "card",
  });
}

const refs = (rows: { orderRef: string }[]) => rows.map((r) => r.orderRef);

describe("sales", () => {
  it("T-I-06 create stores snapshots, computed totals and an order reference", () => {
    const db = testDb();
    const s = createSale(db, {
      occurredAt: at(2026, 3, 10),
      customer: { mode: "new", name: "Ada" },
      paymentMethod: "cash",
      status: "completed",
      items: [
        { newProduct: { name: "Kettle", categoryName: "Equipment" }, quantity: 2, unitPriceMinor: 2500, unitCostMinor: 1000 },
        { newProduct: { name: "Beans", categoryName: "Coffee" }, quantity: 1, unitPriceMinor: 1000, unitCostMinor: 400 },
      ],
      discountMinor: 600,
      taxRateBp: 1000,
    });
    expect(s.orderRef).toMatch(/^ORD-[0-9A-F]{8}$/);
    expect(s).toMatchObject({
      subtotalMinor: 6000,
      discountMinor: 600,
      netMinor: 5400,
      taxMinor: 540,
      totalMinor: 5940,
      costMinor: 2400,
      customerName: "Ada",
    });
    expect(s.items.map((i) => [i.productName, i.categoryName, i.lineNetMinor])).toEqual([
      ["Kettle", "Equipment", 4500],
      ["Beans", "Coffee", 900],
    ]);
    expect(listProducts(db).find((p) => p.name === "Kettle")).toMatchObject({ defaultPriceMinor: 2500, defaultCostMinor: 1000 });
  });

  it("T-I-07 historical product name and price survive a product edit", () => {
    const db = testDb();
    const p = createProduct(db, { name: "Mug", defaultPriceMinor: 1200 });
    const s = createSale(db, {
      occurredAt: at(2026, 3, 1),
      customer: { mode: "walkin" },
      paymentMethod: "card",
      status: "completed",
      items: [{ productId: p.id, quantity: 1, unitPriceMinor: 1200, unitCostMinor: null }],
      discountMinor: 0,
      taxRateBp: 0,
    });
    db.$client.prepare("UPDATE products SET name = 'Big Mug', default_price_minor = 9999 WHERE id = ?").run(p.id);
    expect(getSale(db, s.id).items[0]).toMatchObject({ productName: "Mug", unitPriceMinor: 1200 });
  });

  it("T-I-08 update replaces items and recomputes totals", () => {
    const db = testDb();
    const s = sale(db, { qty: 1, price: 1000 });
    const u = updateSale(db, s.id, {
      occurredAt: s.occurredAt,
      orderRef: s.orderRef,
      customer: { mode: "walkin" },
      paymentMethod: "card",
      status: "refunded",
      items: [{ productId: s.items[0].productId, quantity: 3, unitPriceMinor: 700, unitCostMinor: null }],
      discountMinor: 0,
      taxRateBp: 0,
    });
    expect(u).toMatchObject({ status: "refunded", netMinor: 2100, orderRef: s.orderRef });
    expect(u.items).toHaveLength(1);
  });

  it("T-I-09 duplicate order references and invalid input are rejected server-side", () => {
    const db = testDb();
    sale(db, { orderRef: "A-1" });
    let err: unknown;
    try {
      sale(db, { orderRef: "A-1" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect((err as AppError).message).toBe('Order reference "A-1" is already used');
    expect(() => sale(db, { qty: 0 })).toThrow(ZodError);
    expect(() => sale(db, { discountMinor: 5000, price: 1000 })).toThrow(ZodError);
  });

  it("T-I-10 a failing sale is atomic and leaves no partial rows", () => {
    const db = testDb();
    let err: unknown;
    try {
      createSale(db, {
        occurredAt: at(2026, 3, 10),
        customer: { mode: "new", name: "Temp" },
        paymentMethod: "card",
        status: "completed",
        items: [
          { newProduct: { name: "Ok" }, quantity: 1, unitPriceMinor: 100, unitCostMinor: null },
          { productId: "does-not-exist", quantity: 1, unitPriceMinor: 100, unitCostMinor: null },
        ],
        discountMinor: 0,
        taxRateBp: 0,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(400);
    expect((err as AppError).message).toBe("Selected product no longer exists");
    const n = db.$client
      .prepare("SELECT (SELECT count(*) FROM sales) + (SELECT count(*) FROM products) + (SELECT count(*) FROM customers) AS n")
      .get() as { n: number };
    expect(n.n).toBe(0);
  });

  it("T-I-11 delete removes sales and their items", () => {
    const db = testDb();
    const a = sale(db);
    const b = sale(db);
    expect(deleteSales(db, [a.id, b.id])).toBe(2);
    expect(db.$client.prepare("SELECT count(*) AS n FROM sale_items").get()).toEqual({ n: 0 });
  });

  it("T-I-12 sales link to customers and appear in customer history", () => {
    const db = testDb();
    const c = createCustomer(db, { name: "Bea" });
    sale(db, { customer: { mode: "existing", customerId: c.id }, price: 1500 });
    sale(db, { customer: { mode: "existing", customerId: c.id }, price: 500, status: "refunded" });
    expect(getCustomerDetail(db, c.id).history).toHaveLength(2);
  });

  it("T-I-13 filters by half-open date range", () => {
    const db = testDb();
    seed(db);
    const r = listSales(db, q({ from: at(2026, 3, 1, 0), to: at(2026, 3, 9, 0) }));
    expect(refs(r.rows).sort()).toEqual(["R-1", "R-2"]);
  });

  it("T-I-14 search covers order ref, product and customer; LIKE wildcards are literal", () => {
    const db = testDb();
    seed(db);
    expect(listSales(db, q({ q: "alpha" })).total).toBe(2);
    expect(listSales(db, q({ q: "R-4" })).rows[0].orderRef).toBe("R-4");
    expect(refs(listSales(db, q({ q: "100%" })).rows)).toEqual(["R-3"]);
    expect(listSales(db, q({ q: "%" })).total).toBe(1);
  });

  it("T-I-15 filters by status and payment method", () => {
    const db = testDb();
    seed(db);
    expect(listSales(db, q({ status: ["pending", "refunded"] })).total).toBe(2);
    expect(refs(listSales(db, q({ paymentMethod: ["cash"] })).rows)).toEqual(["R-1"]);
  });

  it("T-I-16 sorts and pages on the server", () => {
    const db = testDb();
    seed(db);
    expect(refs(listSales(db, q({ sort: "amount", dir: "desc" })).rows)).toEqual(["R-2", "R-3", "R-1", "R-4"]);
    expect(listSales(db, q({ sort: "quantity", dir: "desc" })).rows[0]).toMatchObject({ orderRef: "R-3", units: 7 });
    const paged = listSales(db, q({ page: 1, pageSize: 3 }));
    expect(paged.total).toBe(4);
    expect(refs(paged.rows)).toEqual(["R-1"]);
  });
});
