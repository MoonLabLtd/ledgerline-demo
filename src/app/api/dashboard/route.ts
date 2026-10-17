import { z } from "zod";

import { rangeQuerySchema } from "@/lib/validation";
import { withDb } from "@/server/api";
import { dashboard } from "@/server/services/analytics";

export async function GET(request: Request): Promise<Response> {
  return withDb((db) => {
    const sp = new URL(request.url).searchParams;
    const range = rangeQuerySchema.parse({ from: sp.get("from"), to: sp.get("to") });
    const bucket = z
      .enum(["day", "week", "month"])
      .optional()
      .parse(sp.get("bucket") ?? undefined);
    return Response.json(dashboard(db, range, bucket));
  });
}
