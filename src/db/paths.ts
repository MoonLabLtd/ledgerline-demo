import { readFileSync } from "node:fs";
import path from "node:path";

const PACKAGE_NAME = "sales-dashboard";

export function projectRoot(): string {
  const override = process.env.SALES_DASHBOARD_ROOT;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }

  let dir = process.cwd();
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: unknown };
      if (typeof pkg.name === "string" && pkg.name === PACKAGE_NAME) {
        return dir;
      }
    } catch {
      // Skip unreadable, invalid, or non-matching package.json files.
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return process.cwd();
    }
    dir = parent;
  }
}

export function dbPath(): string {
  const override = process.env.SALES_DB_PATH;
  if (override && override.trim().length > 0) {
    return path.resolve(projectRoot(), override);
  }
  return path.join(projectRoot(), "data", "sales.db");
}

export function migrationsDir(): string {
  return path.join(projectRoot(), "drizzle");
}

export function backupsDir(): string {
  return path.join(path.dirname(dbPath()), "backups");
}
