import { csvResponse } from "@/lib/csv";
import { dayKey } from "@/lib/date-range";
import { parseSalesQuery } from "@/lib/validation";
import { withDb } from "@/server/api";
import { salesCsv } from "@/server/services/exports";
import { getSettings } from "@/server/services/settings";

export async function GET(request: Request): Promise<Response> {
  return withDb((db) => {
    const query = parseSalesQuery(new URL(request.url).searchParams);
    return csvResponse(`sales-${dayKey(Date.now())}.csv`, salesCsv(db, query, getSettings(db).currency));
  });
}
