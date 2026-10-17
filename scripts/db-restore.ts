import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { openDatabase } from "@/db/client";
import { backupsDir, dbPath } from "@/db/paths";
import { backupTo, verifyBackupFile } from "@/server/services/maintenance";

async function main() {
  const backupArg = process.argv[2];
  if (!backupArg) {
    process.stderr.write("Usage: pnpm db:restore <path-to-backup.db>\n");
    process.exit(1);
  }

  const backup = path.resolve(backupArg);
  try {
    verifyBackupFile(backup);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }

  const target = dbPath();
  if (existsSync(target)) {
    const current = openDatabase(target);
    const saved = await backupTo(current, path.join(backupsDir(), "pre-restore"));
    current.$client.close();
    console.log(`Current database saved to ${saved}`);
  }

  mkdirSync(path.dirname(target), { recursive: true });
  rmSync(`${target}-wal`, { force: true });
  rmSync(`${target}-shm`, { force: true });
  copyFileSync(backup, target);

  const restored = openDatabase(target);
  restored.$client.close();

  console.log(`Restored ${backup} -> ${target}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
