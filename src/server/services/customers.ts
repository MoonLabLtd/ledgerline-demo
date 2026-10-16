import { and, eq, or, sql } from "drizzle-orm";

import type { DB } from "@/db/client";
import { customers, sales, type Customer } from "@/db/schema";
import { customerRecordSchema } from "@/lib/validation";
import { AppError } from "@/server/errors";
import { likePattern } from "@/server/services/shared";

export type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isDemo: boolean;
  createdAt: number;
  orders: number;
  revenueMinor: number;
  lastSaleAt: number | null;
};

export type HistoryRow = {
  id: string;
  orderRef: string;
  occurredAt: number;
  status: string;
  totalMinor: number;
  netMinor: number;
  paymentMethod: string;
};

const COMPLETED = "completed";

const ordersSubquery = sql<number>`(
  SELECT count(*)
  FROM sales s
  WHERE s.customer_id = ${customers}.${customers.id} AND s.status = ${COMPLETED}
)`;

const revenueSubquery = sql<number>`(
  SELECT coalesce(SUM(s.net_minor), 0)
  FROM sales s
  WHERE s.customer_id = ${customers}.${customers.id} AND s.status = ${COMPLETED}
)`;

const lastSaleAtSubquery = sql<number | null>`(
  SELECT MAX(s.occurred_at)
  FROM sales s
  WHERE s.customer_id = ${customers}.${customers.id}
)`;

const customerColumns = {
  id: customers.id,
  name: customers.name,
  email: customers.email,
  phone: customers.phone,
  notes: customers.notes,
  isDemo: customers.isDemo,
  createdAt: customers.createdAt,
  orders: ordersSubquery,
  revenueMinor: revenueSubquery,
  lastSaleAt: lastSaleAtSubquery,
};

export function listCustomers(db: DB, opts: { q?: string } = {}): CustomerRow[] {
  const q = opts.q?.trim() ?? "";
  const pattern = q === "" ? null : likePattern(q);

  const conditions = [];
  if (pattern !== null) {
    conditions.push(
      or(
        sql`${customers.name} LIKE ${pattern} ESCAPE '\\'`,
        sql`${customers.email} LIKE ${pattern} ESCAPE '\\'`,
        sql`${customers.phone} LIKE ${pattern} ESCAPE '\\'`,
      ),
    );
  }

  return db
    .select(customerColumns)
    .from(customers)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${customers.name} COLLATE NOCASE asc`)
    .all();
}

export function getCustomerDetail(db: DB, id: string): { customer: CustomerRow; history: HistoryRow[] } {
  const customer = db.select(customerColumns).from(customers).where(eq(customers.id, id)).get();
  if (!customer) {
    throw new AppError(404, "Customer not found");
  }
  const history = db
    .select({
      id: sales.id,
      orderRef: sales.orderRef,
      occurredAt: sales.occurredAt,
      status: sales.status,
      totalMinor: sales.totalMinor,
      netMinor: sales.netMinor,
      paymentMethod: sales.paymentMethod,
    })
    .from(sales)
    .where(eq(sales.customerId, id))
    .orderBy(sql`${sales.occurredAt} DESC`, sql`${sales.id} DESC`)
    .limit(200)
    .all();
  return { customer, history };
}

export function createCustomer(db: DB, raw: unknown): Customer {
  const input = customerRecordSchema.parse(raw);
  return db
    .insert(customers)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
    })
    .returning()
    .get();
}

export function updateCustomer(db: DB, id: string, raw: unknown): Customer {
  const input = customerRecordSchema.parse(raw);
  const row = db
    .update(customers)
    .set({
      name: input.name,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
    })
    .where(eq(customers.id, id))
    .returning()
    .get();
  if (!row) {
    throw new AppError(404, "Customer not found");
  }
  return row;
}

export function deleteCustomer(db: DB, id: string): void {
  const { n } = db
    .select({ n: sql<number>`count(*)` })
    .from(sales)
    .where(eq(sales.customerId, id))
    .get()!;
  if (n > 0) {
    throw new AppError(409, `This customer has ${n} sale(s). Customers with history cannot be deleted.`);
  }
  const result = db.delete(customers).where(eq(customers.id, id)).run();
  if (result.changes === 0) {
    throw new AppError(404, "Customer not found");
  }
}
