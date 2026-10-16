import { openDatabase } from "@/db/client";
import { dbPath } from "@/db/paths";

async function main() {
  const file = dbPath();
  const db = openDatabase(file);
  db.$client.close();
  console.log(`Database ready and migrated: ${file}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
