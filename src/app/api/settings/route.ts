import { readJson, withDb } from "@/server/api";
import { getSettings, updateSettings } from "@/server/services/settings";

export async function GET(): Promise<Response> {
  return withDb((db) => {
    return Response.json(getSettings(db));
  });
}

export async function PUT(request: Request): Promise<Response> {
  return withDb(async (db) => {
    const body = await readJson(request);
    return Response.json(updateSettings(db, body));
  });
}
