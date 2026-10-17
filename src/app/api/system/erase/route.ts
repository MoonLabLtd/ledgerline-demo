import { z } from "zod";

import { readJson, withDb } from "@/server/api";
import { eraseAllData } from "@/server/services/maintenance";

const eraseSchema = z.strictObject({
  confirm: z.literal("DELETE ALL DATA", { error: 'Type "DELETE ALL DATA" to confirm' }),
});

export async function POST(request: Request): Promise<Response> {
  return withDb(async (db) => {
    eraseSchema.parse(await readJson(request));
    eraseAllData(db);
    return Response.json({ ok: true });
  });
}
