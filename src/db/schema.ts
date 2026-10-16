import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { PAYMENT_METHODS, SALE_STATUSES, type PaymentMethod, type SaleStatus } from "@/lib/constants";

const statusInClause = sql.raw(SALE_STATUSES.map((s) => `'${s}'`).join(", "));
const paymentMethodInClause = sql.raw(PAYMENT_METHODS.map((m) => `'${m}'`).join(", "));

export const categories = sqliteTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (table) => [uniqueIndex("categories_name_nocase").on(sql`${table.name} COLLATE NOCASE`)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    sku: text("sku"),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "restrict",
      onUpdate: "no action",
    }),
    description: text("description"),
    defaultPriceMinor: integer("default_price_minor").notNull(),
    defaultCostMinor: integer("default_cost_minor"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (table) => [
    check("products_price_nonneg", sql`${table.defaultPriceMinor} >= 0`),
    check("products_cost_nonneg", sql`${table.defaultCostMinor} IS NULL OR ${table.defaultCostMinor} >= 0`),
    uniqueIndex("products_sku_unique").on(table.sku),
    index("products_category_idx").on(table.categoryId),
    index("products_name_idx").on(table.name),
  ],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (table) => [index("customers_name_idx").on(table.name)],
);

export const sales = sqliteTable(
  "sales",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderRef: text("order_ref").notNull(),
    occurredAt: integer("occurred_at").notNull(),
    customerId: text("customer_id").references(() => customers.id, {
      onDelete: "restrict",
      onUpdate: "no action",
    }),
    customerName: text("customer_name"),
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull(),
    status: text("status").$type<SaleStatus>().notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    discountMinor: integer("discount_minor").notNull().default(0),
    netMinor: integer("net_minor").notNull(),
    taxRateBp: integer("tax_rate_bp").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    costMinor: integer("cost_minor"),
    notes: text("notes"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (table) => [
    check(
      "sales_amounts_nonneg",
      sql`${table.subtotalMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.netMinor} >= 0 AND ${table.taxMinor} >= 0`,
    ),
    check("sales_discount_le_subtotal", sql`${table.discountMinor} <= ${table.subtotalMinor}`),
    check("sales_status_valid", sql`${table.status} IN (${statusInClause})`),
    check("sales_payment_method_valid", sql`${table.paymentMethod} IN (${paymentMethodInClause})`),
    uniqueIndex("sales_order_ref_unique").on(table.orderRef),
    index("sales_occurred_at_idx").on(table.occurredAt),
    index("sales_status_occurred_idx").on(table.status, table.occurredAt),
    index("sales_customer_idx").on(table.customerId),
  ],
);

export const saleItems = sqliteTable(
  "sale_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    saleId: text("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade", onUpdate: "no action" }),
    productId: text("product_id").references(() => products.id, {
      onDelete: "restrict",
      onUpdate: "no action",
    }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
      onUpdate: "no action",
    }),
    productName: text("product_name").notNull(),
    categoryName: text("category_name"),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    unitCostMinor: integer("unit_cost_minor"),
    lineSubtotalMinor: integer("line_subtotal_minor").notNull(),
    lineNetMinor: integer("line_net_minor").notNull(),
    lineCostMinor: integer("line_cost_minor"),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    check("sale_items_qty_pos", sql`${table.quantity} > 0`),
    check("sale_items_price_nonneg", sql`${table.unitPriceMinor} >= 0`),
    index("sale_items_sale_idx").on(table.saleId),
    index("sale_items_product_idx").on(table.productId),
    index("sale_items_category_idx").on(table.categoryId),
  ],
);

export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey(),
    currency: text("currency").notNull().default("USD"),
    locale: text("locale").notNull().default("en-US"),
    dateFormat: text("date_format").notNull().default("MMM d, yyyy"),
    defaultRange: text("default_range").notNull().default("30d"),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (table) => [check("settings_singleton", sql`${table.id} = 1`)],
);

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type Settings = typeof settings.$inferSelect;
