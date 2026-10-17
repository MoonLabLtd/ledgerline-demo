import { and, eq, gte, lt, sql } from "drizzle-orm";

import type { DB } from "@/db/client";
import { customers, saleItems, sales } from "@/db/schema";
import { autoBucket, bucketKeyForDay, bucketKeys, parseDay, previousRange, type Bucket, type DateRange } from "@/lib/date-range";
import { percentChange } from "@/lib/money";

/*
 * Metric definitions (Domain Rules §7)
 *
 * - Revenue:    sum of net_minor over sales where status = 'completed' (tax excluded).
 * - AOV:        Math.round(revenue / salesCount), or 0 when there are no completed sales.
 * - Units:      sum of sale_items.quantity over completed sales.
 * - Cost:       sum of non-null cost_minor over completed sales.
 * - Profit:     revenue - cost, only when every completed sale has a non-null cost.
 * - Pending:    sum of net_minor / count over sales where status = 'pending'.
 * - Refunded:   sum of net_minor / count over sales where status = 'refunded'.
 * - Cancelled:  count over sales where status = 'cancelled'.
 *
 * Local calendar day:  date(occurred_at / 1000, 'unixepoch', 'localtime')
 * Local weekday (0 = Sunday): strftime('%w', occurred_at / 1000, 'unixepoch', 'localtime')
 */

const COMPLETED = "completed";
const PENDING = "pending";
const REFUNDED = "refunded";
const CANCELLED = "cancelled";

export const MIN_SALES_FOR_INSIGHTS = 3;

export type Kpis = {
  revenueMinor: number;
  salesCount: number;
  aovMinor: number;
  units: number;
  costMinor: number;
  costedCount: number;
  profitMinor: number | null;
  pendingMinor: number;
  pendingCount: number;
  refundedMinor: number;
  refundedCount: number;
  cancelledCount: number;
};

export type SeriesPoint = {
  key: string;
  revenueMinor: number;
  orders: number;
  units: number;
  aovMinor: number;
};

export type ProductRank = {
  productId: string;
  name: string;
  revenueMinor: number;
  units: number;
  orders: number;
};

export type CategoryBreakdown = {
  name: string;
  revenueMinor: number;
  units: number;
};

export type CustomerRank = {
  customerId: string;
  name: string;
  revenueMinor: number;
  orders: number;
};

export type PaymentBreakdown = {
  method: string;
  revenueMinor: number;
  orders: number;
};

export type StatusBreakdown = {
  status: string;
  netMinor: number;
  orders: number;
};

export type WeekdayBreakdown = {
  dow: number;
  revenueMinor: number;
  orders: number;
};

export type Insight = {
  id: string;
  title: string;
  value: string | number;
  detail?: string;
  tone?: "positive" | "negative" | "neutral";
  money?: boolean;
};

const localDay = sql`date(${sales.occurredAt} / 1000, 'unixepoch', 'localtime')`;

export function kpis(db: DB, r: DateRange): Kpis {
  const row = db
    .select({
      revenueMinor: sql<number>`coalesce(SUM(CASE WHEN ${sales.status} = ${COMPLETED} THEN ${sales.netMinor} END), 0)`,
      salesCount: sql<number>`SUM(CASE WHEN ${sales.status} = ${COMPLETED} THEN 1 ELSE 0 END)`,
      costMinor: sql<number>`coalesce(SUM(CASE WHEN ${sales.status} = ${COMPLETED} AND ${sales.costMinor} IS NOT NULL THEN ${sales.costMinor} END), 0)`,
      costedCount: sql<number>`SUM(CASE WHEN ${sales.status} = ${COMPLETED} AND ${sales.costMinor} IS NOT NULL THEN 1 ELSE 0 END)`,
      pendingMinor: sql<number>`coalesce(SUM(CASE WHEN ${sales.status} = ${PENDING} THEN ${sales.netMinor} END), 0)`,
      pendingCount: sql<number>`SUM(CASE WHEN ${sales.status} = ${PENDING} THEN 1 ELSE 0 END)`,
      refundedMinor: sql<number>`coalesce(SUM(CASE WHEN ${sales.status} = ${REFUNDED} THEN ${sales.netMinor} END), 0)`,
      refundedCount: sql<number>`SUM(CASE WHEN ${sales.status} = ${REFUNDED} THEN 1 ELSE 0 END)`,
      cancelledCount: sql<number>`SUM(CASE WHEN ${sales.status} = ${CANCELLED} THEN 1 ELSE 0 END)`,
    })
    .from(sales)
    .where(and(gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to)))
    .get();

  const unitsRow = db
    .select({ units: sql<number>`coalesce(SUM(${saleItems.quantity}), 0)` })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(and(eq(sales.status, COMPLETED), gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to)))
    .get()!;

  const revenue = row?.revenueMinor ?? 0;
  const salesCount = row?.salesCount ?? 0;
  const costMinor = row?.costMinor ?? 0;
  const costedCount = row?.costedCount ?? 0;

  return {
    revenueMinor: revenue,
    salesCount,
    aovMinor: salesCount > 0 ? Math.round(revenue / salesCount) : 0,
    units: unitsRow.units,
    costMinor,
    costedCount,
    profitMinor: salesCount > 0 && costedCount === salesCount ? revenue - costMinor : null,
    pendingMinor: row?.pendingMinor ?? 0,
    pendingCount: row?.pendingCount ?? 0,
    refundedMinor: row?.refundedMinor ?? 0,
    refundedCount: row?.refundedCount ?? 0,
    cancelledCount: row?.cancelledCount ?? 0,
  };
}

export function series(db: DB, r: DateRange, bucket: Bucket): SeriesPoint[] {
  const where = and(eq(sales.status, COMPLETED), gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to));

  const revenueRows = db
    .select({
      day: sql<string>`date(${sales.occurredAt} / 1000, 'unixepoch', 'localtime')`,
      revenueMinor: sql<number>`coalesce(SUM(${sales.netMinor}), 0)`,
      orders: sql<number>`count(*)`,
    })
    .from(sales)
    .where(where)
    .groupBy(localDay)
    .all();

  const unitsRows = db
    .select({
      day: sql<string>`date(${sales.occurredAt} / 1000, 'unixepoch', 'localtime')`,
      units: sql<number>`coalesce(SUM(${saleItems.quantity}), 0)`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(where)
    .groupBy(localDay)
    .all();

  const byDay = new Map<string, { revenueMinor: number; orders: number; units: number }>();
  for (const row of revenueRows) {
    byDay.set(row.day, { revenueMinor: row.revenueMinor, orders: row.orders, units: 0 });
  }
  for (const row of unitsRows) {
    const agg = byDay.get(row.day) ?? { revenueMinor: 0, orders: 0, units: 0 };
    agg.units += row.units;
    byDay.set(row.day, agg);
  }

  const byKey = new Map<string, { revenueMinor: number; orders: number; units: number }>();
  for (const [day, agg] of byDay) {
    const key = bucketKeyForDay(parseDay(day), bucket);
    const existing = byKey.get(key) ?? { revenueMinor: 0, orders: 0, units: 0 };
    existing.revenueMinor += agg.revenueMinor;
    existing.orders += agg.orders;
    existing.units += agg.units;
    byKey.set(key, existing);
  }

  const points: SeriesPoint[] = [];
  for (const key of bucketKeys(r, bucket)) {
    const agg = byKey.get(key);
    const revenue = agg?.revenueMinor ?? 0;
    const orders = agg?.orders ?? 0;
    const units = agg?.units ?? 0;
    points.push({ key, revenueMinor: revenue, orders, units, aovMinor: orders > 0 ? Math.round(revenue / orders) : 0 });
  }
  return points;
}

export function productRanking(db: DB, r: DateRange, limit = 10): ProductRank[] {
  return db
    .select({
      productId: sql<string>`coalesce(${saleItems.productId}, ${saleItems.productName})`,
      name: saleItems.productName,
      revenueMinor: sql<number>`coalesce(SUM(${saleItems.lineNetMinor}), 0)`,
      units: sql<number>`coalesce(SUM(${saleItems.quantity}), 0)`,
      orders: sql<number>`count(DISTINCT ${saleItems.saleId})`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(and(eq(sales.status, COMPLETED), gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to)))
    .groupBy(sql`coalesce(${saleItems.productId}, ${saleItems.productName})`)
    .orderBy(sql`coalesce(SUM(${saleItems.lineNetMinor}), 0) DESC`, sql`coalesce(SUM(${saleItems.quantity}), 0) DESC`)
    .limit(limit)
    .all();
}

export function categoryBreakdown(db: DB, r: DateRange): CategoryBreakdown[] {
  return db
    .select({
      name: sql<string>`coalesce(${saleItems.categoryName}, 'Uncategorized')`,
      revenueMinor: sql<number>`coalesce(SUM(${saleItems.lineNetMinor}), 0)`,
      units: sql<number>`coalesce(SUM(${saleItems.quantity}), 0)`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(and(eq(sales.status, COMPLETED), gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to)))
    .groupBy(sql`coalesce(${saleItems.categoryName}, 'Uncategorized')`)
    .orderBy(sql`coalesce(SUM(${saleItems.lineNetMinor}), 0) DESC`)
    .all();
}

export function customerRanking(db: DB, r: DateRange, limit = 10): CustomerRank[] {
  return db
    .select({
      customerId: sql<string>`coalesce(${sales.customerId}, '__walkin__')`,
      name: sql<string>`coalesce(${customers.name}, 'Walk-in customers')`,
      revenueMinor: sql<number>`coalesce(SUM(${sales.netMinor}), 0)`,
      orders: sql<number>`count(DISTINCT ${sales.id})`,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(and(eq(sales.status, COMPLETED), gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to)))
    .groupBy(sql`coalesce(${sales.customerId}, '__walkin__')`)
    .orderBy(sql`coalesce(SUM(${sales.netMinor}), 0) DESC`)
    .limit(limit)
    .all();
}

export function paymentBreakdown(db: DB, r: DateRange): PaymentBreakdown[] {
  return db
    .select({
      method: sales.paymentMethod,
      revenueMinor: sql<number>`coalesce(SUM(${sales.netMinor}), 0)`,
      orders: sql<number>`count(*)`,
    })
    .from(sales)
    .where(and(eq(sales.status, COMPLETED), gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to)))
    .groupBy(sales.paymentMethod)
    .orderBy(sql`coalesce(SUM(${sales.netMinor}), 0) DESC`)
    .all();
}

export function statusBreakdown(db: DB, r: DateRange): StatusBreakdown[] {
  return db
    .select({
      status: sales.status,
      netMinor: sql<number>`coalesce(SUM(${sales.netMinor}), 0)`,
      orders: sql<number>`count(*)`,
    })
    .from(sales)
    .where(and(gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to)))
    .groupBy(sales.status)
    .orderBy(sql`${sales.status} ASC`)
    .all();
}

export function weekdayBreakdown(db: DB, r: DateRange): WeekdayBreakdown[] {
  const localWeekday = sql`strftime('%w', ${sales.occurredAt} / 1000, 'unixepoch', 'localtime')`;
  const rows = db
    .select({
      dow: sql<number>`CAST(strftime('%w', ${sales.occurredAt} / 1000, 'unixepoch', 'localtime') AS INTEGER)`,
      revenueMinor: sql<number>`coalesce(SUM(${sales.netMinor}), 0)`,
      orders: sql<number>`count(*)`,
    })
    .from(sales)
    .where(and(eq(sales.status, COMPLETED), gte(sales.occurredAt, r.from), lt(sales.occurredAt, r.to)))
    .groupBy(localWeekday)
    .all();

  const byDow = new Map(rows.map((row) => [row.dow, row]));
  const result: WeekdayBreakdown[] = [];
  for (let dow = 0; dow <= 6; dow += 1) {
    const row = byDow.get(dow);
    result.push({ dow, revenueMinor: row?.revenueMinor ?? 0, orders: row?.orders ?? 0 });
  }
  return result;
}

type InsightInput = {
  currentRevenueMinor: number;
  previousRevenueMinor: number;
  daily: SeriesPoint[];
  products: ProductRank[];
  categories: CategoryBreakdown[];
};

function buildInsights(input: InsightInput): Insight[] {
  const { currentRevenueMinor, previousRevenueMinor, daily, products, categories } = input;

  const bestProduct = products[0];
  const topCategory = categories[0];

  let bestDay: SeriesPoint | undefined;
  for (const point of daily) {
    if (point.revenueMinor > 0 && (bestDay === undefined || point.revenueMinor > bestDay.revenueMinor)) {
      bestDay = point;
    }
  }

  const trend = trendPercentChange(daily);

  const change = percentChange(currentRevenueMinor, previousRevenueMinor);

  const insights: Insight[] = [];

  if (bestProduct) {
    insights.push({
      id: "best-product",
      title: "Best-selling product",
      value: bestProduct.name,
      detail: `${bestProduct.units} units`,
      money: false,
    });
  }

  if (topCategory) {
    const share = currentRevenueMinor > 0 ? Math.round((topCategory.revenueMinor / currentRevenueMinor) * 100) : 0;
    insights.push({
      id: "top-category",
      title: "Top category",
      value: topCategory.name,
      detail: `${share}% of revenue`,
      money: false,
    });
  }

  if (bestDay) {
    insights.push({
      id: "best-day",
      title: "Best day",
      value: bestDay.key,
      detail: String(bestDay.revenueMinor),
      tone: "positive",
      money: true,
    });
  }

  if (trend !== null) {
    const magnitude = Math.abs(trend).toFixed(0);
    insights.push({
      id: "trend",
      title: "Trend within period",
      value: `${trend >= 0 ? "Up" : "Down"} ${magnitude}%`,
      detail: "Second half vs first half",
      tone: trend > 2 ? "positive" : trend < -2 ? "negative" : "neutral",
    });
  }

  insights.push({
    id: "vs-prev",
    title: "Vs previous period",
    value: change === null ? "No prior sales" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
    detail: "Revenue change",
    tone: change === null ? "neutral" : change > 0 ? "positive" : change < 0 ? "negative" : "neutral",
  });

  return insights;
}

/**
 * Splits the day-bucketed series in half for the trend insight. When the
 * series has an odd length, the middle day is skipped.
 */
function trendPercentChange(daily: SeriesPoint[]): number | null {
  if (daily.length < 4) return null;
  const half = Math.floor(daily.length / 2);
  const sum = (points: SeriesPoint[]): number => points.reduce((total, point) => total + point.revenueMinor, 0);
  const first = sum(daily.slice(0, half));
  const second = sum(daily.slice(daily.length - half));
  return percentChange(second, first);
}

export function dashboard(db: DB, range: DateRange, bucketOverride?: Bucket) {
  const bucket = bucketOverride ?? autoBucket(range);
  const previous = previousRange(range);

  const current = kpis(db, range);
  const previousKpis = kpis(db, previous);

  const points = series(db, range, bucket);
  const previousSeries = series(db, previous, bucket);
  const daily = bucket === "day" ? points : series(db, range, "day");

  const products = productRanking(db, range, 10);
  const categories = categoryBreakdown(db, range);
  const customerRank = customerRanking(db, range, 10);
  const payments = paymentBreakdown(db, range);
  const statuses = statusBreakdown(db, range);
  const weekdays = weekdayBreakdown(db, range);

  const insights =
    current.salesCount < MIN_SALES_FOR_INSIGHTS
      ? []
      : buildInsights({
          currentRevenueMinor: current.revenueMinor,
          previousRevenueMinor: previousKpis.revenueMinor,
          daily,
          products,
          categories,
        });

  return {
    range,
    previousRange: previous,
    bucket,
    kpis: { current, previous: previousKpis },
    series: points,
    previousSeries,
    daily,
    products,
    categories,
    customers: customerRank,
    payments,
    statuses,
    weekdays,
    insights,
  };
}

export type Dashboard = ReturnType<typeof dashboard>;
