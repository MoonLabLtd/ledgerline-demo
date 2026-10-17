import { describe, expect, it } from "vitest";

import { dashboard, kpis, series } from "@/server/services/analytics";
import { createCategory, createProduct } from "@/server/services/catalog";
import { createSale } from "@/server/services/sales";

import { at, sale, testDb } from "../helpers";

const march = { from: at(2026, 3, 1, 0), to: at(2026, 4, 1, 0) };

describe("analytics", () => {
  it("T-I-17 KPIs across completed, pending, cancelled and refunded sales", () => {
    const db = testDb();
    sale(db, { price: 10000, discountMinor: 1000, taxRateBp: 1000 });
    sale(db, { price: 5000, status: "pending" });
    sale(db, { price: 7000, status: "cancelled" });
    sale(db, { price: 3000, status: "refunded" });
    expect(kpis(db, march)).toMatchObject({
      revenueMinor: 9000,
      salesCount: 1,
      aovMinor: 9000,
      units: 1,
      pendingMinor: 5000,
      pendingCount: 1,
      refundedMinor: 3000,
      refundedCount: 1,
      cancelledCount: 1,
    });
  });

  it("T-I-18 a raw status update moves revenue from completed to refunded", () => {
    const db = testDb();
    const s = sale(db, { price: 4000 });
    expect(kpis(db, march)).toMatchObject({ revenueMinor: 4000, salesCount: 1 });
    db.$client.prepare("UPDATE sales SET status = 'refunded' WHERE id = ?").run(s.id);
    expect(kpis(db, march)).toMatchObject({
      revenueMinor: 0,
      salesCount: 0,
      refundedMinor: 4000,
      refundedCount: 1,
    });
  });

  it("T-I-19 profit requires every completed sale to be costed", () => {
    const db = testDb();
    sale(db, { price: 1000, cost: 600 });
    expect(kpis(db, march)).toMatchObject({ profitMinor: 400, costedCount: 1 });
    sale(db, { product: "Mystery", price: 1000 });
    expect(kpis(db, march).profitMinor).toBeNull();
  });

  it("T-I-20 exclusive upper bound with local-time boundaries", () => {
    const db = testDb();
    sale(db, { occurredAt: at(2026, 3, 1, 0) });
    sale(db, { occurredAt: at(2026, 4, 1, 0) });
    sale(db, { occurredAt: at(2026, 2, 28, 23) });
    expect(kpis(db, march).salesCount).toBe(1);
  });

  it("T-I-21 day-bucketed series is zero-filled in key order", () => {
    const db = testDb();
    sale(db, { occurredAt: at(2026, 3, 2, 23), price: 100 });
    sale(db, { occurredAt: at(2026, 3, 2, 1), price: 200 });
    sale(db, { occurredAt: at(2026, 3, 4, 9), price: 300 });
    const points = series(db, { from: at(2026, 3, 1, 0), to: at(2026, 3, 5, 0) }, "day");
    expect(points.map((p) => [p.key, p.revenueMinor, p.units])).toEqual([
      ["2026-03-01", 0, 0],
      ["2026-03-02", 300, 2],
      ["2026-03-03", 0, 0],
      ["2026-03-04", 300, 1],
    ]);
  });

  it("T-I-22 dashboard rankings, breakdowns, KPIs and series length", () => {
    const db = testDb();
    const grinder = createProduct(db, { name: "Grinder", categoryId: null, defaultPriceMinor: 5000, defaultCostMinor: null });
    const sellGrinder = (status: "completed" | "cancelled") =>
      createSale(db, {
        occurredAt: at(2026, 3, 10),
        customer: { mode: "walkin" },
        paymentMethod: "card",
        status,
        items: [{ productId: grinder.id, quantity: 1, unitPriceMinor: 5000, unitCostMinor: null }],
        discountMinor: 0,
        taxRateBp: 0,
      });
    for (let i = 0; i < 2; i += 1) sellGrinder("completed");
    for (let i = 0; i < 9; i += 1) sellGrinder("cancelled");
    const coffee = createCategory(db, { name: "Coffee" });
    const beans = createProduct(db, { name: "Beans", categoryId: coffee.id, defaultPriceMinor: 1500, defaultCostMinor: null });
    createSale(db, {
      occurredAt: at(2026, 3, 11),
      customer: { mode: "walkin" },
      paymentMethod: "cash",
      status: "completed",
      items: [{ productId: beans.id, quantity: 1, unitPriceMinor: 1500, unitCostMinor: null }],
      discountMinor: 0,
      taxRateBp: 0,
    });
    const d = dashboard(db, march);
    expect(d.products.map((p) => [p.name, p.revenueMinor, p.units])).toEqual([
      ["Grinder", 10000, 2],
      ["Beans", 1500, 1],
    ]);
    expect(d.categories.map((c) => c.name)).toEqual(["Uncategorized", "Coffee"]);
    expect(d.payments.find((p) => p.method === "card")?.revenueMinor).toBe(10000);
    expect(d.kpis.current.revenueMinor).toBe(11500);
    expect(d.series).toHaveLength(31);
  });

  it("T-I-23 previous-period revenue and the vs-prev insight", () => {
    const db = testDb();
    sale(db, { occurredAt: at(2026, 2, 10), price: 1000 });
    sale(db, { occurredAt: at(2026, 3, 10), price: 1500 });
    let d = dashboard(db, march);
    expect(d.kpis.previous.revenueMinor).toBe(1000);
    expect(d.insights).toEqual([]);
    sale(db, { occurredAt: at(2026, 3, 11), price: 1500 });
    sale(db, { occurredAt: at(2026, 3, 12), price: 1500 });
    d = dashboard(db, march);
    expect(d.insights.find((i) => i.id === "vs-prev")?.value).toBe("+350.0%");
  });
});
