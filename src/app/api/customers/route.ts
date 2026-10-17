import { readJson, withDb } from "@/server/api";
import { createCustomer, listCustomers } from "@/server/services/customers";

export async function GET(request: Request): Promise<Response> {
  return withDb((db) => {
    const sp = new URL(request.url).searchParams;
    return Response.json(listCustomers(db, { q: sp.get("q") ?? undefined }));
  });
}

export async function POST(request: Request): Promise<Response> {
  return withDb(async (db) => {
    const body = await readJson(request);
    return Response.json(createCustomer(db, body), { status: 201 });
  });
}
