import { and, asc, eq, ne, or, sql } from "drizzle-orm";

import type { DB } from "@/db/client";
import { categories, products, saleItems, type Category, type Product } from "@/db/schema";
import { categoryInputSchema, productInputSchema } from "@/lib/validation";
import { AppError } from "@/server/errors";
import { likePattern, type DbOrTx } from "@/server/services/shared";

export type CategoryRow = {
  id: string;
  name: string;
  productCount: number;
};

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  categoryId: string | null;
  categoryName: string | null;
  description: string | null;
  defaultPriceMinor: number;
  defaultCostMinor: number | null;
  archived: boolean;
  isDemo: boolean;
  createdAt: number;
  updatedAt: number;
  unitsSold: number;
  revenueMinor: number;
};

const COMPLETED = "completed";

const unitsSoldSubquery = sql<number>`(
  SELECT coalesce(SUM(si.quantity), 0)
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.product_id = ${products.id} AND s.status = ${COMPLETED}
)`;

const revenueSubquery = sql<number>`(
  SELECT coalesce(SUM(si.line_net_minor), 0)
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.product_id = ${products.id} AND s.status = ${COMPLETED}
)`;

/**
 * Trims the name, returns the existing case-insensitive category row, or
 * inserts and returns a complete category row.
 */
export function findOrCreateCategory(tx: DbOrTx, name: string, isDemo = false): Category {
  const trimmed = name.trim();
  const existing = tx
    .select()
    .from(categories)
    .where(sql`${categories.name} COLLATE NOCASE = ${trimmed}`)
    .get();
  if (existing) return existing;
  return tx.insert(categories).values({ name: trimmed, isDemo }).returning().get();
}

export function listCategories(db: DB): CategoryRow[] {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      productCount: sql<number>`(
        SELECT count(*) FROM products p WHERE p.category_id = ${categories}.${categories.id}
      )`,
    })
    .from(categories)
    .orderBy(sql`${categories.name} COLLATE NOCASE asc`)
    .all();
}

export function createCategory(db: DB, raw: unknown): Category {
  const input = categoryInputSchema.parse(raw);
  const duplicate = db
    .select({ id: categories.id })
    .from(categories)
    .where(sql`${categories.name} COLLATE NOCASE = ${input.name}`)
    .get();
  if (duplicate) {
    throw new AppError(409, `Category "${input.name}" already exists`);
  }
  return findOrCreateCategory(db, input.name);
}

export function renameCategory(db: DB, id: string, raw: unknown): Category {
  const input = categoryInputSchema.parse(raw);
  const duplicate = db
    .select({ id: categories.id })
    .from(categories)
    .where(sql`${categories.name} COLLATE NOCASE = ${input.name}`)
    .get();
  if (duplicate && duplicate.id !== id) {
    throw new AppError(409, `Category "${input.name}" already exists`);
  }
  const row = db.update(categories).set({ name: input.name }).where(eq(categories.id, id)).returning().get();
  if (!row) {
    throw new AppError(404, "Category not found");
  }
  return row;
}

export function deleteCategory(db: DB, id: string): void {
  const { n } = db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.categoryId, id))
    .get()!;
  if (n > 0) {
    throw new AppError(409, `This category is used by ${n} product(s). Reassign them first.`);
  }
  const result = db.delete(categories).where(eq(categories.id, id)).run();
  if (result.changes === 0) {
    throw new AppError(404, "Category not found");
  }
}

export function listProducts(db: DB, opts: { q?: string; includeArchived?: boolean } = {}): ProductRow[] {
  const includeArchived = opts.includeArchived ?? false;
  const q = opts.q?.trim() ?? "";
  const pattern = q === "" ? null : likePattern(q);

  const conditions = [];
  if (!includeArchived) {
    conditions.push(eq(products.archived, false));
  }
  if (pattern !== null) {
    conditions.push(or(sql`${products.name} LIKE ${pattern} ESCAPE '\\'`, sql`${products.sku} LIKE ${pattern} ESCAPE '\\'`));
  }

  return db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      categoryId: products.categoryId,
      categoryName: categories.name,
      description: products.description,
      defaultPriceMinor: products.defaultPriceMinor,
      defaultCostMinor: products.defaultCostMinor,
      archived: products.archived,
      isDemo: products.isDemo,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      unitsSold: unitsSoldSubquery,
      revenueMinor: revenueSubquery,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(products.archived), sql`${products.name} COLLATE NOCASE asc`)
    .all();
}

export function createProduct(db: DB, raw: unknown): Product {
  const input = productInputSchema.parse(raw);
  assertSkuFree(db, input.sku);
  assertCategory(db, input.categoryId);
  return db
    .insert(products)
    .values({
      name: input.name,
      sku: input.sku,
      categoryId: input.categoryId,
      description: input.description,
      defaultPriceMinor: input.defaultPriceMinor,
      defaultCostMinor: input.defaultCostMinor,
      archived: input.archived ?? false,
    })
    .returning()
    .get();
}

export function updateProduct(db: DB, id: string, raw: unknown): Product {
  const input = productInputSchema.parse(raw);
  assertSkuFree(db, input.sku, id);
  assertCategory(db, input.categoryId);
  const row = db
    .update(products)
    .set({
      name: input.name,
      sku: input.sku,
      categoryId: input.categoryId,
      description: input.description,
      defaultPriceMinor: input.defaultPriceMinor,
      defaultCostMinor: input.defaultCostMinor,
      archived: input.archived ?? false,
    })
    .where(eq(products.id, id))
    .returning()
    .get();
  if (!row) {
    throw new AppError(404, "Product not found");
  }
  return row;
}

export function setProductArchived(db: DB, id: string, archived: boolean): Product {
  const row = db.update(products).set({ archived }).where(eq(products.id, id)).returning().get();
  if (!row) {
    throw new AppError(404, "Product not found");
  }
  return row;
}

export function deleteProduct(db: DB, id: string): void {
  const referenced = db.select({ id: saleItems.id }).from(saleItems).where(eq(saleItems.productId, id)).get();
  if (referenced) {
    throw new AppError(409, "This product appears in past sales. Archive it instead to keep history intact.");
  }
  const result = db.delete(products).where(eq(products.id, id)).run();
  if (result.changes === 0) {
    throw new AppError(404, "Product not found");
  }
}

function assertSkuFree(db: DbOrTx, sku: string | null, exceptId?: string): void {
  if (sku === null) return;
  const existing = db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.sku, sku), exceptId === undefined ? undefined : ne(products.id, exceptId)))
    .get();
  if (existing) {
    throw new AppError(409, `SKU "${sku}" is already used by another product`);
  }
}

function assertCategory(db: DbOrTx, categoryId: string | null): void {
  if (categoryId === null) return;
  const existing = db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).get();
  if (!existing) {
    throw new AppError(404, "Category not found");
  }
}
