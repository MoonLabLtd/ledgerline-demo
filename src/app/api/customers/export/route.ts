import { csvResponse } from "@/lib/csv";
import { withDb } from "@/server/api";
import { customersCsv } from "@/server/services/exports";
import { getSettings } from "@/server/services/settings";

export async function GET(): Promise<Response> {
  return withDb((db) => {
    return csvResponse("customers.csv", customersCsv(db, getSettings(db).currency));
  });
}