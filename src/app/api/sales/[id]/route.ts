import { readJson, withDb } from "@/server/api";
import { AppError } from "@/server/errors";
import { deleteSales, getSale, updateSale } from "@/server/services/sales";

export async function GET(_request: Request, ctx: RouteContext<"/api/sales/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    return Response.json(getSale(db, id));
  });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/sales/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    return Response.json(updateSale(db, id, body));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sales/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    const deleted = deleteSales(db, [id]);
    if (deleted === 0) {
      throw new AppError(404, "Sale not found");
    }
    return Response.json({ deleted: 1 });
  });
}
