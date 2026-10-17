import { readJson, withDb } from "@/server/api";
import { deleteCustomer, getCustomerDetail, updateCustomer } from "@/server/services/customers";

export async function GET(_request: Request, ctx: RouteContext<"/api/customers/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    return Response.json(getCustomerDetail(db, id));
  });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/customers/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    return Response.json(updateCustomer(db, id, body));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/customers/[id]">): Promise<Response> {
  return withDb(async (db) => {
    const { id } = await ctx.params;
    deleteCustomer(db, id);
    return Response.json({ deleted: 1 });
  });
}
