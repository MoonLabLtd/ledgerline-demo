import { openDatabase } from "@/db/client";
import { dbPath } from "@/db/paths";
import { removeDemoData } from "@/server/services/maintenance";

async function main() {
  const db = openDatabase(dbPath());
  const result = removeDemoData(db);
  db.$client.close();
  console.log("Removed demo data:");
  console.log(result);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
