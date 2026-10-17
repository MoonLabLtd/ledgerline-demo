import { z } from "zod";

import { parseSalesQuery } from "@/lib/validation";
import { readJson, withDb } from "@/server/api";
import { AppError } from "@/server/errors";
import { createSale, deleteSales, listSales } from "@/server/services/sales";

const bulkDeleteSchema = z.strictObject({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

export async function GET(request: Request): Promise<Response> {
  return withDb((db) => {
    const query = parseSalesQuery(new URL(request.url).searchParams);
    return Response.json(listSales(db, query));
  });
}

export async function POST(request: Request): Promise<Response> {
  return withDb(async (db) => {
    const body = await readJson(request);
    return Response.json(createSale(db, body), { status: 201 });
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return withDb(async (db) => {
    const body = await readJson(request);
    const { ids } = bulkDeleteSchema.parse(body);
    const deleted = deleteSales(db, ids);
    if (deleted === 0) {
      throw new AppError(404, "No matching sales");
    }
    return Response.json({ deleted });
  });
}
