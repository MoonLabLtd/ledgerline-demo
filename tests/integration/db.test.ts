import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { openDatabase } from "@/db/client";
import { backupTo, verifyBackupFile } from "@/server/services/maintenance";
import { getSale } from "@/server/services/sales";
import { getSettings, updateSettings } from "@/server/services/settings";

import { sale, testDb, tmpDir } from "../helpers";

describe("database", () => {
  it("T-I-01 first open creates the data directory, the file, all tables and default settings", () => {
    const file = path.join(tmpDir(), "nested", "dir", "sales.db");
    const db = testDb(file);
    expect(fs.existsSync(file)).toBe(true);
    const names = (db.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (r) => r.name,
    );
    expect(names).toEqual(expect.arrayContaining(["sales", "sale_items", "products", "customers", "categories", "settings"]));
    expect(db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(getSettings(db)).toMatchObject({ currency: "USD", locale: "en-US", defaultRange: "30d" });
  });

  it("T-I-02 reopening is idempotent: no migrations re-run, data kept", () => {
    const file = path.join(tmpDir(), "sales.db");
    const db1 = testDb(file);
    const s = sale(db1);
    updateSettings(db1, { currency: "EUR", locale: "de-DE", dateFormat: "dd/MM/yyyy", defaultRange: "7d" });
    db1.$client.close();
    const db2 = testDb(file);
    expect(getSale(db2, s.id).totalMinor).toBe(1000);
    expect(getSettings(db2)).toMatchObject({ currency: "EUR", defaultRange: "7d" });
  });

  it("T-I-03 foreign keys and CHECK constraints are enforced by the database", () => {
    const db = testDb();
    expect(() =>
      db.$client
        .prepare(
          "INSERT INTO sale_items (id, sale_id, product_name, quantity, unit_price_minor, line_subtotal_minor, line_net_minor, position) VALUES ('x','missing','P',1,1,1,1,0)",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
    const s = sale(db);
    expect(() => db.$client.prepare("UPDATE sales SET status = 'bogus' WHERE id = ?").run(s.id)).toThrow(/CHECK/);
  });

  it("T-I-04 a clear error when the database cannot be opened", () => {
    expect(() => openDatabase(tmpDir())).toThrow(/Cannot open SQLite database/);
  });

  it("T-I-05 a consistent, verifiable backup of a live database", async () => {
    const db = testDb();
    sale(db);
    const file = await backupTo(db, tmpDir());
    expect(() => verifyBackupFile(file)).not.toThrow();
    const copy = testDb(file);
    expect(copy.$client.prepare("SELECT count(*) AS n FROM sales").get()).toEqual({ n: 1 });
  });
});
