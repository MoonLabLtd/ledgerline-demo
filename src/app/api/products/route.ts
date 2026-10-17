import { readJson, withDb } from "@/server/api";
import { createProduct, listProducts } from "@/server/services/catalog";

export async function GET(request: Request): Promise<Response> {
  return withDb((db) => {
    const sp = new URL(request.url).searchParams;
    return Response.json(listProducts(db, { q: sp.get("q") ?? undefined, includeArchived: sp.get("archived") === "1" }));
  });
}

export async function POST(request: Request): Promise<Response> {
  return withDb(async (db) => {
    const body = await readJson(request);
    return Response.json(createProduct(db, body), { status: 201 });
  });
}
