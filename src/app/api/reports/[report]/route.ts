import { z } from "zod";

import { csvResponse } from "@/lib/csv";
import { rangeQuerySchema } from "@/lib/validation";
import { withDb } from "@/server/api";
import { REPORTS, reportCsv } from "@/server/services/exports";
import { getSettings } from "@/server/services/settings";

export async function GET(_request: Request, ctx: RouteContext<"/api/reports/[report]">): Promise<Response> {
  return withDb(async (db) => {
    const { report } = await ctx.params;
    const name = z.enum(REPORTS).parse(report);
    const sp = new URL(_request.url).searchParams;
    const range = rangeQuerySchema.parse({ from: sp.get("from"), to: sp.get("to") });
    return csvResponse(`report-${name}.csv`, reportCsv(db, name, range, getSettings(db).currency));
  });
}
