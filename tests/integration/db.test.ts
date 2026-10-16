import { existsSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { openDatabase } from "@/db/client";
import { backupTo, verifyBackupFile } from "@/server/services/maintenance";
import { getSale } from "@/server/services/sales";
import { getSettings, updateSettings } from "@/server/services/settings";
import { sale, testDb, tmpDir } from "../helpers";

const REQUIRED_TABLES = ["sales", "sale_items", "products", "customers", "categories", "settings"];

describe("database integration", () => {
  it("T-I-01: first open creates the file, six tables, WAL, FK, and default settings", () => {
    const file = path.join(tmpDir(), "nested", "dir", "sales.db");
    const db = openDatabase(file);

    expect(existsSync(file)).toBe(true);

    const tables = (db.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (row) => row.name,
    );
    for (const name of REQUIRED_TABLES) {
      expect(tables).toContain(name);
    }

    expect(db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);

    const settings = getSettings(db);
    expect(settings.currency).toBe("USD");
    expect(settings.locale).toBe("en-US");
    expect(settings.defaultRange).toBe("30d");

    db.$client.close();
  });

  it("T-I-02: sale and settings persist across close and reopen", () => {
    const file = path.join(tmpDir(), "test.db");
    const first = openDatabase(file);
    const created = sale(first);
    updateSettings(first, { currency: "EUR", locale: "de-DE", dateFormat: "dd/MM/yyyy", defaultRange: "7d" });
    first.$client.close();

    const reopened = openDatabase(file);
    expect(getSale(reopened, created.id).totalMinor).toBe(1000);
    const settings = getSettings(reopened);
    expect(settings.currency).toBe("EUR");
    expect(settings.defaultRange).toBe("7d");
    reopened.$client.close();
  });

  it("T-I-03: raw SQL enforces foreign keys and status CHECK constraints", () => {
    const db = testDb();

    expect(() =>
      db.$client
        .prepare(
          "INSERT INTO sale_items (id, sale_id, product_name, quantity, unit_price_minor, line_subtotal_minor, line_net_minor, position) VALUES ('x','missing','P',1,1,1,1,0)",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);

    sale(db);
    expect(() => db.$client.prepare("UPDATE sales SET status = 'bogus'").run()).toThrow(/CHECK/);
  });

  it("T-I-04: opening an existing directory as a database throws", () => {
    expect(() => openDatabase(tmpDir())).toThrow(/Cannot open SQLite database/);
  });

  it("T-I-05: backup is verifiable and reopenable with the sale retained", async () => {
    const db = testDb();
    sale(db);

    const file = await backupTo(db, tmpDir());
    expect(() => verifyBackupFile(file)).not.toThrow();

    const backupDb = testDb(file);
    const { n } = backupDb.$client.prepare("SELECT count(*) AS n FROM sales").get() as { n: number };
    expect(n).toBe(1);
  });
});
