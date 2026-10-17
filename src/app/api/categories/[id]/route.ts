import { readJson, withDb } from "@/server/api";
import { deleteCategory, renameCategory } from "@/server/services/catalog";

export async function PUT(request: Request, ctx: RouteContext<"/api/categories/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    return Response.json(renameCategory(db, id, body));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/categories/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    deleteCategory(db, id);
    return Response.json({ deleted: 1 });
  });
}
