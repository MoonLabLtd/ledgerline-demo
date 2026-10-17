import { csvResponse } from "@/lib/csv";
import { withDb } from "@/server/api";
import { productsCsv } from "@/server/services/exports";
import { getSettings } from "@/server/services/settings";

export async function GET(): Promise<Response> {
  return withDb((db) => {
    return csvResponse("products.csv", productsCsv(db, getSettings(db).currency));
  });
}
