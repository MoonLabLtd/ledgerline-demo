import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv";
import { salesQuerySchema } from "@/lib/validation";
import { reportCsv, salesCsv } from "@/server/services/exports";

import { at, sale, testDb } from "../helpers";

describe("exports", () => {
  it("T-I-29 sales CSV formats money, labels and neutralizes formula injection", () => {
    const db = testDb();
    sale(db, { orderRef: "E-1", price: 1250, taxRateBp: 1000, notes: "=HYPERLINK(1)", status: "completed" });
    sale(db, { orderRef: "E-2", price: 999, status: "pending" });
    const rows = parseCsv(salesCsv(db, salesQuerySchema.parse({ status: ["completed"] }), "USD"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      Order: "E-1",
      Status: "Completed",
      "Net (USD)": "12.50",
      "Tax (USD)": "1.25",
      "Total (USD)": "13.75",
      Notes: "'=HYPERLINK(1)",
      Items: "Widget x1",
      Units: "1",
    });
  });

  it("T-I-30 timeseries and products reports", () => {
    const db = testDb();
    sale(db, { occurredAt: at(2026, 3, 2), price: 500, product: "Tea" });
    const range = { from: at(2026, 3, 1, 0), to: at(2026, 3, 4, 0) };
    expect(parseCsv(reportCsv(db, "timeseries", range, "USD"))).toHaveLength(3);
    expect(parseCsv(reportCsv(db, "products", range, "USD"))[0].Product).toBe("Tea");
  });
});
