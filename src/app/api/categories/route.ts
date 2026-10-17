import { readJson, withDb } from "@/server/api";
import { createCategory, listCategories } from "@/server/services/catalog";

export async function GET(): Promise<Response> {
  return withDb((db) => {
    return Response.json(listCategories(db));
  });
}

export async function POST(request: Request): Promise<Response> {
  return withDb(async (db) => {
    const body = await readJson(request);
    return Response.json(createCategory(db, body), { status: 201 });
  });
}
