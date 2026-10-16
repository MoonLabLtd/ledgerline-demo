import { connection } from "next/server";

import { openDatabase, type DB } from "@/db/client";
import { dbPath } from "@/db/paths";

export const instant = false;

let db: DB | null = null;

async function ensureDatabase(): Promise<string> {
  await connection();
  const file = dbPath();
  if (!db) {
    db = openDatabase(file);
  }
  return file;
}

export default async function Home() {
  const file = await ensureDatabase();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ledgerline</h1>
      <p className="text-sm text-muted-foreground">Database: {file}</p>
    </main>
  );
}
