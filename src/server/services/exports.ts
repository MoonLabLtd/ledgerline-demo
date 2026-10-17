import { format } from "date-fns";

import type { DB } from "@/db/client";
import { toCsv } from "@/lib/csv";
import { PAYMENT_LABELS, STATUS_LABELS } from "@/lib/constants";
import { formatBucketLabel, type DateRange } from "@/lib/date-range";
import { toMajorString } from "@/lib/money";
import { type SalesQuery } from "@/lib/validation";
import { dashboard } from "@/server/services/analytics";
import { listProducts } from "@/server/services/catalog";
import { listCustomers } from "@/server/services/customers";
import { listSalesForExport } from "@/server/services/sales";

export const REPORTS = ["timeseries", "products", "categories", "customers", "payments"] as const;

export type ReportName = (typeof REPORTS)[number];

function moneyCell(minor: number | null): string {
  return minor === null ? "" : toMajorString(minor);
}

export function salesCsv(db: DB, query: SalesQuery, currency: string): string {
  const rows = listSalesForExport(db, query);
  const headers = [
    "Order",
    "Date",
    "Status",
    "Payment method",
    "Customer",
    "Items",
    "Units",
    `Subtotal (${currency})`,
    `Discount (${currency})`,
    `Net (${currency})`,
    `Tax (${currency})`,
    `Total (${currency})`,
    `Cost (${currency})`,
    "Notes",
  ];
  const data = rows.map((row) => [
    row.orderRef,
    format(new Date(row.occurredAt), "yyyy-MM-dd HH:mm"),
    STATUS_LABELS[row.status as keyof typeof STATUS_LABELS] ?? row.status,
    PAYMENT_LABELS[row.paymentMethod as keyof typeof PAYMENT_LABELS] ?? row.paymentMethod,
    row.customerName ?? "Walk-in",
    row.products ?? "",
    row.units,
    moneyCell(row.subtotalMinor),
    moneyCell(row.discountMinor),
    moneyCell(row.netMinor),
    moneyCell(row.taxMinor),
    moneyCell(row.totalMinor),
    moneyCell(row.costMinor),
    row.notes ?? "",
  ]);
  return toCsv(headers, data);
}

export function reportCsv(db: DB, report: ReportName, range: DateRange, currency: string): string {
  const data = dashboard(db, range);

  switch (report) {
    case "timeseries": {
      const headers = ["Period", "Period start", `Revenue (${currency})`, "Sales", "Units", `AOV (${currency})`];
      const rows = data.series.map((point) => [
        formatBucketLabel(point.key, data.bucket),
        point.key,
        moneyCell(point.revenueMinor),
        point.orders,
        point.units,
        moneyCell(point.aovMinor),
      ]);
      return toCsv(headers, rows);
    }
    case "products": {
      const headers = ["Product", `Revenue (${currency})`, "Units", "Sales"];
      const rows = data.products.map((product) => [product.name, moneyCell(product.revenueMinor), product.units, product.orders]);
      return toCsv(headers, rows);
    }
    case "categories": {
      const headers = ["Category", `Revenue (${currency})`, "Units", "Share %"];
      const revenue = data.kpis.current.revenueMinor;
      const rows = data.categories.map((category) => [
        category.name,
        moneyCell(category.revenueMinor),
        category.units,
        revenue > 0 ? ((category.revenueMinor / revenue) * 100).toFixed(1) : "0",
      ]);
      return toCsv(headers, rows);
    }
    case "customers": {
      const headers = ["Customer", `Revenue (${currency})`, "Sales"];
      const rows = data.customers.map((customer) => [customer.name, moneyCell(customer.revenueMinor), customer.orders]);
      return toCsv(headers, rows);
    }
    case "payments": {
      const headers = ["Payment method", `Revenue (${currency})`, "Sales"];
      const rows = data.payments.map((payment) => [
        PAYMENT_LABELS[payment.method as keyof typeof PAYMENT_LABELS] ?? payment.method,
        moneyCell(payment.revenueMinor),
        payment.orders,
      ]);
      return toCsv(headers, rows);
    }
  }
}

export function productsCsv(db: DB, currency: string): string {
  const headers = [
    "Name",
    "SKU",
    "Category",
    `Default price (${currency})`,
    `Default cost (${currency})`,
    "Status",
    "Units sold",
    `Revenue (${currency})`,
  ];
  const rows = listProducts(db, { includeArchived: true }).map((product) => [
    product.name,
    product.sku ?? "",
    product.categoryName ?? "",
    moneyCell(product.defaultPriceMinor),
    moneyCell(product.defaultCostMinor),
    product.archived ? "Archived" : "Active",
    product.unitsSold,
    moneyCell(product.revenueMinor),
  ]);
  return toCsv(headers, rows);
}

export function customersCsv(db: DB, currency: string): string {
  const headers = ["Name", "Email", "Phone", "Completed sales", `Revenue (${currency})`, "Customer since"];
  const rows = listCustomers(db).map((customer) => [
    customer.name,
    customer.email ?? "",
    customer.phone ?? "",
    customer.orders,
    moneyCell(customer.revenueMinor),
    format(new Date(customer.createdAt), "yyyy-MM-dd"),
  ]);
  return toCsv(headers, rows);
}
