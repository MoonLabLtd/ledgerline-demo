import { backupsDir, dbPath } from "@/db/paths";
import { withDb } from "@/server/api";
import { listBackups, stats } from "@/server/services/maintenance";

export async function GET(): Promise<Response> {
  return withDb((db) => {
    return Response.json({
      dbPath: dbPath(),
      backupsDir: backupsDir(),
      stats: stats(db),
      backups: listBackups(backupsDir()),
    });
  });
}
