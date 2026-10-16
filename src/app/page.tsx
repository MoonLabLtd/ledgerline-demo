import { connection } from "next/server";

import { dbPath } from "@/db/paths";
import { getDb } from "@/server/db";
import { AppError } from "@/server/errors";

export const instant = false;

async function ensureDatabase(): Promise<string> {
  await connection();
  const file = dbPath();
  try {
    getDb();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(500, `Database unavailable: ${message}`);
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
