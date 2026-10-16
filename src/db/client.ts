import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { dbPath, migrationsDir } from "@/db/paths";
import * as schema from "@/db/schema";

export type DB = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

declare global {
  var __salesDb: DB | undefined;
  var __salesDbFile: string | undefined;
}

export class DatabaseInitError extends Error {
  readonly dbFile: string;

  constructor(message: string, dbFile: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "DatabaseInitError";
    this.dbFile = dbFile;
  }
}

export function openDatabase(file: string, migrationsFolder: string = migrationsDir()): DB {
  if (file !== ":memory:") {
    try {
      mkdirSync(path.dirname(file), { recursive: true });
    } catch {
      throw new DatabaseInitError(`Cannot create the data directory for ${file}. Check folder permissions.`, file);
    }
  }

  let sqlite: Database.Database;
  try {
    sqlite = new Database(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DatabaseInitError(
      `Cannot open SQLite database at ${file}: ${message}. If better-sqlite3 failed to load, run \`pnpm rebuild better-sqlite3\` with the Node version you start the app with.`,
      file,
      error,
    );
  }

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");

  const db = drizzle(sqlite, { schema });

  try {
    migrate(db, { migrationsFolder });
  } catch (error) {
    sqlite.close();
    const message = error instanceof Error ? error.message : String(error);
    throw new DatabaseInitError(`Database migration failed for ${file}: ${message}`, file, error);
  }

  db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing().run();

  return db;
}

export function getDb(): DB {
  const file = dbPath();
  const cached = globalThis.__salesDb;

  if (cached && globalThis.__salesDbFile === file) {
    return cached;
  }

  if (cached) {
    cached.$client.close();
  }

  const db = openDatabase(file);
  globalThis.__salesDb = db;
  globalThis.__salesDbFile = file;
  return db;
}
