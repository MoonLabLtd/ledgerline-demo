import { openDatabase } from "@/db/client";
import { dbPath } from "@/db/paths";
import { hasData, seedDemoData } from "@/server/demo-seed";

async function main() {
  const file = dbPath();
  const db = openDatabase(file);
  const force = process.argv.includes("--force");
  if (hasData(db) && !force) {
    process.stderr.write(`Refusing to seed: ${file} already contains data. Re-run with --force to add demo rows anyway.\n`);
    db.$client.close();
    process.exit(1);
  }
  const result = seedDemoData(db);
  db.$client.close();
  console.log(`Seeded demo data into ${file}:`);
  console.log(result);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
