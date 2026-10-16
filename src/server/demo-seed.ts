import { addDays, startOfDay } from "date-fns";

import type { DB } from "@/db/client";
import { categories, customers, products, saleItems, sales, type Product } from "@/db/schema";
import { computeSaleTotals, type LineInput } from "@/lib/money";

/**
 * The exact PRNG required by the TRD contract. Do not change the body: any
 * change to the draw output is a breaking change for downstream demos/tests.
 */
function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_TAX_RATE_BP = 1000;

const CATALOG = [
  { category: "Coffee", product: "House Blend Beans 1kg", sku: "COF-HB1", price: 2800, cost: 1350 },
  { category: "Coffee", product: "Single Origin Ethiopia 250g", sku: "COF-ETH", price: 1650, cost: 780 },
  { category: "Coffee", product: "Decaf Colombia 500g", sku: "COF-DCF", price: 1900, cost: 920 },
  { category: "Coffee", product: "Cold Brew Concentrate", sku: "COF-CBC", price: 1200, cost: 480 },
  { category: "Equipment", product: "Pour-over Kettle", sku: "EQP-KTL", price: 6900, cost: 3400 },
  { category: "Equipment", product: "Burr Grinder", sku: "EQP-GRD", price: 14900, cost: 8200 },
  { category: "Equipment", product: "French Press 1L", sku: "EQP-FPR", price: 3900, cost: 1700 },
  { category: "Equipment", product: "Digital Scale", sku: "EQP-SCL", price: 2900, cost: 1250 },
  { category: "Tea", product: "Sencha Green 100g", sku: "TEA-SEN", price: 1400, cost: 560 },
  { category: "Tea", product: "Earl Grey 100g", sku: "TEA-EGR", price: 1100, cost: 420 },
  { category: "Tea", product: "Chamomile Blend", sku: "TEA-CHM", price: 950, cost: null },
  { category: "Merch", product: "Ceramic Mug", sku: "MER-MUG", price: 1800, cost: 650 },
  { category: "Merch", product: "Canvas Tote", sku: "MER-TOT", price: 2200, cost: 800 },
  { category: "Merch", product: "Gift Card", sku: "MER-GFT", price: 5000, cost: null },
  { category: "Workshops", product: "Home Barista Class", sku: "WKS-BAR", price: 8500, cost: 2500 },
  { category: "Workshops", product: "Latte Art Session", sku: "WKS-LAT", price: 6500, cost: 2000 },
] as const;

const CUSTOMER_NAMES = [
  "Amelia Hart",
  "Noah Patel",
  "Sofia Rossi",
  "Liam Chen",
  "Maya Johnson",
  "Ethan Brooks",
  "Zara Ahmed",
  "Lucas Martin",
  "Chloe Nguyen",
  "Oliver Smith",
  "Isla Murphy",
  "Mateo Garcia",
  "Hana Sato",
  "Felix Wagner",
  "Aria Kapoor",
  "Leo Dubois",
  "Nora Lindqvist",
  "Kai Tanaka",
  "Ruby Evans",
  "Omar Haddad",
] as const;

const PAYMENT_POOL = ["card", "card", "card", "cash", "e_wallet", "bank_transfer"] as const;

/**
 * Returns whether at least one sale or one product exists. This is a pure
 * helper for the later `db:seed` CLI guard (Phase 5); `seedDemoData` never
 * calls it and never refuses when data exists.
 */
export function hasData(db: DB): boolean {
  const sale = db.select({ id: sales.id }).from(sales).limit(1).get();
  if (sale) return true;
  const product = db.select({ id: products.id }).from(products).limit(1).get();
  return Boolean(product);
}

export function seedDemoData(
  db: DB,
  opts: { now?: Date; days?: number; seed?: number } = {},
): { sales: number; products: number; customers: number } {
  const seed = opts.seed ?? 42;
  const now = opts.now ?? new Date();
  const days = opts.days ?? 400;
  const r = mulberry32(seed);

  return db.transaction((tx) => {
    const existingSkus = new Set(
      tx
        .select({ sku: products.sku })
        .from(products)
        .all()
        .map((row) => row.sku)
        .filter((sku): sku is string => sku !== null),
    );
    const categoryByName = new Map(
      tx
        .select()
        .from(categories)
        .all()
        .map((category) => [category.name.toLowerCase(), category]),
    );

    const productEntries: { product: Product; categoryName: string }[] = [];
    for (const row of CATALOG) {
      let category = categoryByName.get(row.category.toLowerCase());
      if (!category) {
        category = tx.insert(categories).values({ name: row.category, isDemo: true }).returning().get();
        categoryByName.set(row.category.toLowerCase(), category);
      }
      const product = tx
        .insert(products)
        .values({
          name: row.product,
          sku: existingSkus.has(row.sku) ? null : row.sku,
          categoryId: category.id,
          defaultPriceMinor: row.price,
          defaultCostMinor: row.cost,
          isDemo: true,
        })
        .returning()
        .get();
      productEntries.push({ product, categoryName: category.name });
    }

    const customerCreatedAt = addDays(startOfDay(now), -(days + 5)).getTime();
    const customerRows = CUSTOMER_NAMES.map((name) =>
      tx
        .insert(customers)
        .values({
          name,
          email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
          isDemo: true,
          createdAt: customerCreatedAt,
        })
        .returning()
        .get(),
    );

    const today = startOfDay(now);
    const nowMs = now.getTime();
    let saleCounter = 0;

    for (let d = days; d >= 0; d -= 1) {
      const day = addDays(today, -d);
      const growth = 1 + (days - d) / days;
      const weekday = day.getDay();
      const weekend = weekday === 0 || weekday === 6 ? 1.35 : 1;
      const month = day.getMonth() + 1;
      const seasonal = 1 + 0.25 * Math.sin((2 * Math.PI * month) / 12);
      const n = Math.max(0, Math.round((1.2 + r() * 2.6) * growth * weekend * seasonal));

      for (let s = 0; s < n; s += 1) {
        const timeMs = Math.round(day.getTime() + (8 + r() * 11) * 3_600_000);
        if (timeMs > nowMs) continue;

        const lineCount = r() < 0.7 ? 1 : r() < 0.8 ? 2 : 3;
        const selected: { entry: (typeof productEntries)[number]; quantity: number }[] = [];
        const lineInputs: LineInput[] = [];
        for (let i = 0; i < lineCount; i += 1) {
          const entry = productEntries[Math.floor(r() * productEntries.length)];
          const quantity = r() < 0.75 ? 1 : 1 + Math.floor(r() * 4);
          selected.push({ entry, quantity });
          lineInputs.push({
            quantity,
            unitPriceMinor: entry.product.defaultPriceMinor,
            unitCostMinor: entry.product.defaultCostMinor,
          });
        }

        const subtotal = lineInputs.reduce((sum, line) => sum + line.quantity * line.unitPriceMinor, 0);
        const discount = r() < 0.15 ? Math.round(subtotal * (r() < 0.5 ? 0.1 : 0.05)) : 0;
        const totals = computeSaleTotals(lineInputs, discount, DEMO_TAX_RATE_BP);

        const statusRoll = r();
        const status = statusRoll < 0.86 ? "completed" : statusRoll < 0.92 ? "pending" : statusRoll < 0.96 ? "refunded" : "cancelled";
        const walkIn = r() < 0.35;
        const customer = walkIn ? null : customerRows[Math.floor(r() * customerRows.length)];
        const paymentMethod = PAYMENT_POOL[Math.floor(r() * PAYMENT_POOL.length)];

        saleCounter += 1;
        const sale = tx
          .insert(sales)
          .values({
            orderRef: `DEMO-${String(saleCounter).padStart(5, "0")}`,
            occurredAt: timeMs,
            customerId: customer !== null ? customer.id : null,
            customerName: customer !== null ? customer.name : null,
            paymentMethod,
            status,
            subtotalMinor: totals.subtotalMinor,
            discountMinor: totals.discountMinor,
            netMinor: totals.netMinor,
            taxRateBp: DEMO_TAX_RATE_BP,
            taxMinor: totals.taxMinor,
            totalMinor: totals.totalMinor,
            costMinor: totals.costMinor,
            notes: null,
            isDemo: true,
            createdAt: timeMs,
          })
          .returning({ id: sales.id })
          .get()!;

        for (let i = 0; i < selected.length; i += 1) {
          const item = selected[i];
          tx.insert(saleItems)
            .values({
              saleId: sale.id,
              productId: item.entry.product.id,
              categoryId: item.entry.product.categoryId,
              productName: item.entry.product.name,
              categoryName: item.entry.categoryName,
              quantity: item.quantity,
              unitPriceMinor: item.entry.product.defaultPriceMinor,
              unitCostMinor: item.entry.product.defaultCostMinor,
              lineSubtotalMinor: totals.lines[i].subtotalMinor,
              lineNetMinor: totals.lines[i].netMinor,
              lineCostMinor: totals.lines[i].costMinor,
              position: i,
            })
            .run();
        }
      }
    }

    return { sales: saleCounter, products: 16, customers: 20 };
  });
}
