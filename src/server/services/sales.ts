import { randomBytes } from "node:crypto";

import { and, eq, gte, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";

import type { DB } from "@/db/client";
import { categories, customers, products, saleItems, sales, type Sale, type SaleItem } from "@/db/schema";
import { computeSaleTotals, type LineInput } from "@/lib/money";
import { saleInputSchema, salesQuerySchema, type SaleInput, type SalesQuery } from "@/lib/validation";
import { AppError } from "@/server/errors";
import { findOrCreateCategory } from "@/server/services/catalog";
import { likePattern, type DbOrTx, type Tx } from "@/server/services/shared";

export type SaleWithItems = Sale & {
  items: SaleItem[];
};

export type SaleRow = {
  id: string;
  orderRef: string;
  occurredAt: number;
  customerId: string | null;
  customerName: string | null;
  paymentMethod: string;
  status: string;
  netMinor: number;
  totalMinor: number;
  itemCount: number;
  units: number;
  firstProduct: string | null;
  isDemo: boolean;
};

const itemCountSubquery = sql<number>`(
  SELECT count(*)
  FROM sale_items si
  WHERE si.sale_id = ${sales}.${sales.id}
)`;

const unitsSubquery = sql<number>`(
  SELECT coalesce(SUM(si.quantity), 0)
  FROM sale_items si
  WHERE si.sale_id = ${sales}.${sales.id}
)`;

const firstProductSubquery = sql<string | null>`(
  SELECT si.product_name
  FROM sale_items si
  WHERE si.sale_id = ${sales}.${sales.id}
  ORDER BY si.position ASC
  LIMIT 1
)`;

const unitsOrderBySubquery = sql<number>`(
  SELECT coalesce(SUM(si.quantity), 0)
  FROM sale_items si
  WHERE si.sale_id = ${sales.id}
)`;

const saleRowColumns = {
  id: sales.id,
  orderRef: sales.orderRef,
  occurredAt: sales.occurredAt,
  customerId: sales.customerId,
  customerName: sales.customerName,
  paymentMethod: sales.paymentMethod,
  status: sales.status,
  netMinor: sales.netMinor,
  totalMinor: sales.totalMinor,
  itemCount: itemCountSubquery,
  units: unitsSubquery,
  firstProduct: firstProductSubquery,
  isDemo: sales.isDemo,
};

export function createSale(db: DB, raw: unknown, opts: { isDemo?: boolean } = {}): SaleWithItems {
  const input = saleInputSchema.parse(raw);
  const isDemo = opts.isDemo ?? false;
  const id = db.transaction((tx) => {
    if (input.orderRef !== null) {
      assertRefFree(tx, input.orderRef);
    }
    return writeSale(tx, null, input, { orderRef: input.orderRef ?? newOrderRef(tx), isDemo });
  });
  return getSale(db, id);
}

export function updateSale(db: DB, id: string, raw: unknown): SaleWithItems {
  const input = saleInputSchema.parse(raw);
  const existing = db.select().from(sales).where(eq(sales.id, id)).get();
  if (!existing) {
    throw new AppError(404, "Sale not found");
  }
  db.transaction((tx) => {
    const ref = input.orderRef ?? existing.orderRef;
    assertRefFree(tx, ref, id);
    writeSale(tx, id, input, { orderRef: ref, isDemo: existing.isDemo });
  });
  return getSale(db, id);
}

export function deleteSales(db: DB, ids: string[]): number {
  if (ids.length === 0) return 0;
  return db.delete(sales).where(inArray(sales.id, ids)).run().changes;
}

export function getSale(db: DB, id: string): SaleWithItems {
  const sale = db.select().from(sales).where(eq(sales.id, id)).get();
  if (!sale) {
    throw new AppError(404, "Sale not found");
  }
  const items = db
    .select()
    .from(saleItems)
    .where(eq(saleItems.saleId, id))
    .orderBy(sql`${saleItems.position} ASC`)
    .all();
  return { ...sale, items };
}

type ResolvedItem = {
  productId: string;
  productName: string;
  categoryId: string | null;
  categoryName: string | null;
};

function writeSale(tx: Tx, saleId: string | null, input: SaleInput, opts: { orderRef: string; isDemo: boolean }): string {
  let customerId: string | null = null;
  let customerName: string | null = null;

  if (input.customer.mode === "walkin") {
    customerName = input.customer.name;
  } else if (input.customer.mode === "existing") {
    const existing = tx.select().from(customers).where(eq(customers.id, input.customer.customerId)).get();
    if (!existing) {
      throw new AppError(400, "Selected customer no longer exists");
    }
    customerId = existing.id;
    customerName = existing.name;
  } else {
    const inserted = tx
      .insert(customers)
      .values({
        name: input.customer.name,
        email: input.customer.email ?? null,
        phone: input.customer.phone ?? null,
        isDemo: opts.isDemo,
      })
      .returning()
      .get();
    customerId = inserted.id;
    customerName = inserted.name;
  }

  const resolvedItems: ResolvedItem[] = [];
  const lineInputs: LineInput[] = [];

  for (const item of input.items) {
    if (item.productId) {
      const row = tx
        .select({ product: products, categoryName: categories.name })
        .from(products)
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .where(eq(products.id, item.productId))
        .get();
      if (!row) {
        throw new AppError(400, "Selected product no longer exists");
      }
      resolvedItems.push({
        productId: row.product.id,
        productName: row.product.name,
        categoryId: row.product.categoryId,
        categoryName: row.categoryName,
      });
    } else {
      const newProduct = item.newProduct;
      if (!newProduct) {
        throw new AppError(400, "Selected product no longer exists");
      }
      if (newProduct.sku !== null) {
        assertSkuFree(tx, newProduct.sku);
      }
      let categoryId: string | null = null;
      let categoryName: string | null = null;
      if (newProduct.categoryName !== null) {
        const category = findOrCreateCategory(tx, newProduct.categoryName, opts.isDemo);
        categoryId = category.id;
        categoryName = category.name;
      }
      const inserted = tx
        .insert(products)
        .values({
          name: newProduct.name,
          sku: newProduct.sku,
          categoryId,
          defaultPriceMinor: item.unitPriceMinor,
          defaultCostMinor: item.unitCostMinor,
          isDemo: opts.isDemo,
        })
        .returning()
        .get();
      resolvedItems.push({
        productId: inserted.id,
        productName: inserted.name,
        categoryId,
        categoryName,
      });
    }
    lineInputs.push({ quantity: item.quantity, unitPriceMinor: item.unitPriceMinor, unitCostMinor: item.unitCostMinor });
  }

  const totals = computeSaleTotals(lineInputs, input.discountMinor, input.taxRateBp);

  let persistedId: string;
  if (saleId === null) {
    persistedId = tx
      .insert(sales)
      .values({
        orderRef: opts.orderRef,
        occurredAt: input.occurredAt,
        customerId,
        customerName,
        paymentMethod: input.paymentMethod,
        status: input.status,
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        netMinor: totals.netMinor,
        taxRateBp: input.taxRateBp,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        costMinor: totals.costMinor,
        notes: input.notes,
        isDemo: opts.isDemo,
      })
      .returning({ id: sales.id })
      .get()!.id;
  } else {
    persistedId = saleId;
    tx.update(sales)
      .set({
        orderRef: opts.orderRef,
        occurredAt: input.occurredAt,
        customerId,
        customerName,
        paymentMethod: input.paymentMethod,
        status: input.status,
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        netMinor: totals.netMinor,
        taxRateBp: input.taxRateBp,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        costMinor: totals.costMinor,
        notes: input.notes,
        updatedAt: Date.now(),
      })
      .where(eq(sales.id, persistedId))
      .run();
    tx.delete(saleItems).where(eq(saleItems.saleId, persistedId)).run();
  }

  for (let i = 0; i < input.items.length; i += 1) {
    const item = input.items[i];
    const resolved = resolvedItems[i];
    tx.insert(saleItems)
      .values({
        saleId: persistedId,
        productId: resolved.productId,
        categoryId: resolved.categoryId,
        productName: resolved.productName,
        categoryName: resolved.categoryName,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        unitCostMinor: item.unitCostMinor,
        lineSubtotalMinor: totals.lines[i].subtotalMinor,
        lineNetMinor: totals.lines[i].netMinor,
        lineCostMinor: totals.lines[i].costMinor,
        position: i,
      })
      .run();
  }

  return persistedId;
}

export function newOrderRef(tx: DbOrTx): string {
  for (;;) {
    const ref = `ORD-${randomBytes(4).toString("hex").toUpperCase()}`;
    const existing = tx.select({ id: sales.id }).from(sales).where(eq(sales.orderRef, ref)).get();
    if (!existing) return ref;
  }
}

export function assertRefFree(tx: DbOrTx, ref: string, exceptId?: string): void {
  const existing = tx
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.orderRef, ref), exceptId === undefined ? undefined : ne(sales.id, exceptId)))
    .get();
  if (existing) {
    throw new AppError(409, `Order reference "${ref}" is already used`);
  }
}

export function salesWhere(query: SalesQuery): SQL | undefined {
  const conditions: SQL[] = [];
  if (query.from !== undefined) {
    conditions.push(gte(sales.occurredAt, query.from));
  }
  if (query.to !== undefined) {
    conditions.push(lt(sales.occurredAt, query.to));
  }
  if (query.status && query.status.length > 0) {
    conditions.push(inArray(sales.status, query.status));
  }
  if (query.paymentMethod && query.paymentMethod.length > 0) {
    conditions.push(inArray(sales.paymentMethod, query.paymentMethod));
  }
  if (query.productId !== undefined) {
    conditions.push(sql`EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = ${sales.id} AND si.product_id = ${query.productId})`);
  }
  if (query.categoryId !== undefined) {
    conditions.push(sql`EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = ${sales.id} AND si.category_id = ${query.categoryId})`);
  }
  const search = query.q?.trim() ?? "";
  if (search !== "") {
    const pattern = likePattern(search);
    const searchClause = or(
      sql`${sales.orderRef} LIKE ${pattern} ESCAPE '\\'`,
      sql`${sales.customerName} LIKE ${pattern} ESCAPE '\\'`,
      sql`EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = ${sales.id} AND si.product_name LIKE ${pattern} ESCAPE '\\')`,
    );
    if (searchClause) {
      conditions.push(searchClause);
    }
  }
  return conditions.length === 0 ? undefined : and(...conditions);
}

export function listSales(db: DB, q: SalesQuery): { rows: SaleRow[]; total: number } {
  const query = salesQuerySchema.parse(q);
  const where = salesWhere(query);

  const { n } = db
    .select({ n: sql<number>`count(*)` })
    .from(sales)
    .where(where ?? undefined)
    .get()!;

  const sortColumn =
    query.sort === "date"
      ? sql`${sales.occurredAt}`
      : query.sort === "amount"
        ? sql`${sales.totalMinor}`
        : query.sort === "quantity"
          ? unitsOrderBySubquery
          : sql`${sales.status}`;
  const direction = query.dir === "asc" ? sql`ASC` : sql`DESC`;

  const rows = db
    .select(saleRowColumns)
    .from(sales)
    .where(where ?? undefined)
    .orderBy(sql`${sortColumn} ${direction}`, sql`${sales.occurredAt} DESC`, sql`${sales.id} DESC`)
    .limit(query.pageSize)
    .offset(query.page * query.pageSize)
    .all();

  return { rows, total: n };
}

function assertSkuFree(tx: DbOrTx, sku: string): void {
  const existing = tx.select({ id: products.id }).from(products).where(eq(products.sku, sku)).get();
  if (existing) {
    throw new AppError(409, `SKU "${sku}" is already used by another product`);
  }
}
