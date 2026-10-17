import { z } from "zod";

import { readJson, withDb } from "@/server/api";
import { deleteProduct, setProductArchived, updateProduct } from "@/server/services/catalog";

const archivePatchSchema = z.strictObject({
  archived: z.boolean(),
});

export async function PUT(request: Request, ctx: RouteContext<"/api/products/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    return Response.json(updateProduct(db, id, body));
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/products/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const { archived } = archivePatchSchema.parse(body);
    return Response.json(setProductArchived(db, id, archived));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/products/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    deleteProduct(db, id);
    return Response.json({ deleted: 1 });
  });
}
