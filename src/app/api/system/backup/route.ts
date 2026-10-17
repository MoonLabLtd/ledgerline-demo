import path from "node:path";

import { backupsDir } from "@/db/paths";
import { withDb } from "@/server/api";
import { backupTo } from "@/server/services/maintenance";

export async function POST(): Promise<Response> {
  return withDb(async (db) => {
    const file = await backupTo(db, backupsDir());
    return Response.json({ file: path.basename(file) }, { status: 201 });
  });
}
