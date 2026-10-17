import { openDatabase } from "@/db/client";
import { backupsDir, dbPath } from "@/db/paths";
import { backupTo } from "@/server/services/maintenance";

async function main() {
  const dir = process.argv[2];
  const db = openDatabase(dbPath());
  const file = await backupTo(db, dir ?? backupsDir());
  db.$client.close();
  console.log(`Backup written: ${file}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
